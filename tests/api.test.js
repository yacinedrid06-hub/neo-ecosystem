const { after, before, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const { createDatabase } = require("../server/db");

let db;
let server;
let origin;

before(async () => {
  db = createDatabase(":memory:");
  server = createApp({ db, secureCookies: false }).listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  db.exec("DELETE FROM sessions; DELETE FROM users;");
});

after(() => {
  server.close();
  db.close();
});

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  if (options.body && !headers.has("origin")) headers.set("origin", origin);
  const response = await fetch(`${origin}${path}`, { ...options, headers });
  return response;
}

async function register(email, name = "Test User") {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password: "a-strong-password-123" })
  });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  return { cookie, user: (await response.json()).user };
}

test("serves the app shell and rejects unauthenticated private data", async () => {
  const page = await request("/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /NEO/);
  const projects = await request("/api/projects");
  assert.equal(projects.status, 401);
  assert.equal((await request("/server/db.js")).status, 404);
  assert.equal((await request("/package.json")).status, 404);
});

test("validates registration and creates a session without exposing credentials", async () => {
  const invalid = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email", name: "User", password: "short" })
  });
  assert.equal(invalid.status, 400);

  const { cookie, user } = await register("first@example.test");
  assert.equal(user.email, "first@example.test");
  assert.equal("password_hash" in user, false);
  assert.match(cookie, /^neo_session=/);
  assert.notEqual(db.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").get(user.id).token_hash, cookie.slice("neo_session=".length));
  const session = await request("/api/auth/me", { cookie });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.id, user.id);
});

test("rejects duplicate accounts and invalid passwords", async () => {
  await register("duplicate@example.test");
  const duplicate = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: "duplicate@example.test", name: "Another", password: "a-strong-password-123" })
  });
  assert.equal(duplicate.status, 409);

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "duplicate@example.test", password: "wrong-password-000" })
  });
  assert.equal(login.status, 401);
});

test("persists projects and isolates each account's data", async () => {
  const first = await register("owner@example.test");
  const second = await register("other@example.test");
  const created = await request("/api/projects", {
    method: "POST",
    cookie: first.cookie,
    body: JSON.stringify({ title: "Learn a language", description: "Practice every day." })
  });
  assert.equal(created.status, 201);
  const project = (await created.json()).project;

  const ownList = await request("/api/projects", { cookie: first.cookie });
  assert.equal((await ownList.json()).projects.length, 1);
  const otherList = await request("/api/projects", { cookie: second.cookie });
  assert.deepEqual((await otherList.json()).projects, []);

  const forbiddenUpdate = await request(`/api/projects/${project.id}`, {
    method: "PATCH",
    cookie: second.cookie,
    body: JSON.stringify({ status: "done" })
  });
  assert.equal(forbiddenUpdate.status, 404);
});

test("updates and deletes projects and stores profile and lesson progress", async () => {
  const { cookie, user } = await register("workspace@example.test");
  const created = await request("/api/projects", {
    method: "POST",
    cookie,
    body: JSON.stringify({ title: "First draft", description: "Start small." })
  });
  const project = (await created.json()).project;
  const updated = await request(`/api/projects/${project.id}`, {
    method: "PATCH",
    cookie,
    body: JSON.stringify({ title: "Second draft", status: "active" })
  });
  assert.equal((await updated.json()).project.title, "Second draft");

  const completed = await request("/api/learning/focus", { method: "POST", cookie });
  assert.equal(completed.status, 204);
  const progress = await request("/api/learning", { cookie });
  assert.deepEqual((await progress.json()).completed.map((lesson) => lesson.id), ["focus"]);

  const profile = await request("/api/profile", {
    method: "PATCH",
    cookie,
    body: JSON.stringify({ name: "Updated User" })
  });
  assert.equal((await profile.json()).user.name, "Updated User");
  assert.equal((await request("/api/auth/me", { cookie })).status, 200);

  const deleted = await request(`/api/projects/${project.id}`, { method: "DELETE", cookie });
  assert.equal(deleted.status, 204);
  assert.deepEqual((await (await request("/api/projects", { cookie })).json()).projects, []);
});

test("saves check-ins and challenge progress in the account database", async () => {
  const { cookie } = await register("journal@example.test");
  const date = new Date().toISOString().slice(0, 10);
  const checkin = await request("/api/checkins", {
    method: "POST",
    cookie,
    body: JSON.stringify({ date, mood: 4, reflection: "Made time to reflect." })
  });
  assert.equal(checkin.status, 201);
  const challenge = await request(`/api/challenges/${date}`, { method: "POST", cookie });
  assert.equal(challenge.status, 204);
  const summary = await request("/api/summary", { cookie });
  assert.deepEqual(await summary.json(), { projects: 0, checkins: 1, challenges: 1, lessons: 0 });
});

test("imports old browser data once without replacing existing account entries", async () => {
  const { cookie } = await register("migration@example.test");
  const date = "2026-11-17";
  const importRequest = {
    checkin: { date, mood: 3, reflection: "Kept from the earlier app." },
    challengeDate: date
  };
  const firstImport = await request("/api/migrate-local", {
    method: "POST",
    cookie,
    body: JSON.stringify(importRequest)
  });
  assert.deepEqual(await firstImport.json(), { checkin: true, challenge: true });

  const duplicateImport = await request("/api/migrate-local", {
    method: "POST",
    cookie,
    body: JSON.stringify(importRequest)
  });
  assert.deepEqual(await duplicateImport.json(), { checkin: false, challenge: false });
  const checkins = await request("/api/checkins", { cookie });
  assert.equal((await checkins.json()).checkins.length, 1);
});

test("blocks cross-origin writes and malformed request objects", async () => {
  const { cookie } = await register("origin@example.test");
  const crossOrigin = await request("/api/projects", {
    method: "POST",
    cookie,
    headers: { origin: "https://attacker.example" },
    body: JSON.stringify({ title: "Not allowed" })
  });
  assert.equal(crossOrigin.status, 403);

  const invalidBody = await request("/api/projects", {
    method: "POST",
    cookie,
    body: JSON.stringify([])
  });
  assert.equal(invalidBody.status, 400);
});

test("exports only the signed-in user's data and invalidates the session on logout", async () => {
  const first = await register("export@example.test");
  const second = await register("another-export@example.test");
  await request("/api/projects", {
    method: "POST",
    cookie: first.cookie,
    body: JSON.stringify({ title: "Private project", description: "" })
  });

  const exported = await request("/api/export", { cookie: first.cookie });
  const data = await exported.json();
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].title, "Private project");
  assert.equal("password_hash" in data.user, false);

  const logout = await request("/api/auth/logout", { method: "POST", cookie: first.cookie });
  assert.equal(logout.status, 204);
  const expiredSession = await request("/api/auth/me", { cookie: first.cookie });
  assert.equal(expiredSession.status, 401);
  const otherSession = await request("/api/auth/me", { cookie: second.cookie });
  assert.equal(otherSession.status, 200);
});

test("limits repeated authentication attempts", async () => {
  const limitedApp = createApp({ db, secureCookies: false, authLimit: 1, authWindowMs: 60_000 });
  const limitedServer = limitedApp.listen(0, "127.0.0.1");
  await once(limitedServer, "listening");
  const limitedOrigin = `http://127.0.0.1:${limitedServer.address().port}`;
  const options = {
    method: "POST",
    headers: { "content-type": "application/json", origin: limitedOrigin },
    body: JSON.stringify({ email: "missing@example.test", password: "wrong-password-000" })
  };
  try {
    assert.equal((await fetch(`${limitedOrigin}/api/auth/login`, options)).status, 401);
    const limited = await fetch(`${limitedOrigin}/api/auth/login`, options);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
  } finally {
    limitedServer.close();
    await once(limitedServer, "close");
  }
});

test("serves installable app metadata and keeps API responses out of shell files", async () => {
  const manifestResponse = await request("/manifest.webmanifest");
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icon.svg"));

  const worker = await request("/sw.js");
  assert.equal(worker.status, 200);
  assert.match(await worker.text(), /url\.pathname\.startsWith\("\/api\/"\)/);
});

test("keeps saved account data after the SQLite connection is reopened", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neo-db-test-"));
  const databasePath = path.join(directory, "app.sqlite");
  try {
    const firstConnection = createDatabase(databasePath);
    firstConnection.prepare(`
      INSERT INTO users (id, email, name, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("user-id", "persist@example.test", "Persistent User", "hash", "salt", new Date().toISOString());
    firstConnection.prepare(`
      INSERT INTO projects (id, user_id, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("project-id", "user-id", "Persistent project", "", "planned", new Date().toISOString(), new Date().toISOString());
    firstConnection.close();

    const reopened = createDatabase(databasePath);
    assert.equal(reopened.prepare("SELECT title FROM projects WHERE user_id = ?").get("user-id").title, "Persistent project");
    reopened.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
