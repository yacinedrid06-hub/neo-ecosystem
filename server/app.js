const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  hashPassword,
  hashToken,
  readCookie,
  setSessionCookie,
  verifyPassword
} = require("./security");

const PUBLIC_ROOT = path.resolve(__dirname, "..");
const ALLOWED_ASSETS = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/sw.js", "sw.js"],
  ["/icon-192.png", "icon-192.png"],
  ["/icon-512.png", "icon-512.png"],
  ["/icon.svg", "icon.svg"]
]);
const LESSON_IDS = new Set(["focus", "reflection", "planning"]);
const PROJECT_STATUSES = new Set(["planned", "active", "done"]);
const SESSION_COOKIE_SECURE = process.env.NODE_ENV === "production";
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function sameOrigin(request, response, next) {
  const origin = request.get("origin");
  if (!origin) return next();

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.host === request.get("host") && ["http:", "https:"].includes(parsedOrigin.protocol)) {
      return next();
    }
  } catch {
    return response.status(403).json({ error: "Request origin is not allowed." });
  }
  return response.status(403).json({ error: "Request origin is not allowed." });
}

function createAuthRateLimiter(limit, windowMs) {
  const attempts = new Map();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || "unknown";
    let bucket = attempts.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      attempts.set(key, bucket);
    }
    if (bucket.count >= limit) {
      response.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return response.status(429).json({ error: "Too many authentication attempts. Try again later." });
    }
    bucket.count += 1;
    if (attempts.size > 1000) {
      for (const [address, entry] of attempts) {
        if (entry.resetAt <= now) attempts.delete(address);
      }
      while (attempts.size > 10000) attempts.delete(attempts.keys().next().value);
    }
    return next();
  };
}

function createApp({ db, secureCookies = SESSION_COOKIE_SECURE, authLimit = 20, authWindowMs = AUTH_RATE_WINDOW_MS } = {}) {
  if (!db) throw new Error("A database connection is required.");

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
  app.use(helmet());
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use((request, response, next) => {
    if (request.body === null || Array.isArray(request.body) ||
        (request.body !== undefined && typeof request.body !== "object")) {
      return response.status(400).json({ error: "Request body must be a JSON object." });
    }
    if (request.body === undefined) request.body = {};
    return next();
  });
  app.use((request, response, next) => {
    if (request.path.startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
    next();
  });

  for (const [route, fileName] of ALLOWED_ASSETS) {
    app.get(route, (request, response, next) => {
      response.sendFile(path.join(PUBLIC_ROOT, fileName), (error) => {
        if (error) next(error);
      });
    });
  }
  app.get("/health", (request, response) => response.json({ status: "ok" }));

  function getCurrentUser(request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
    const session = db.prepare(`
      SELECT users.id, users.name, users.email
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), Math.floor(Date.now() / 1000));
    return session || null;
  }

  function requireAuth(request, response, next) {
    const user = getCurrentUser(request);
    if (!user) return response.status(401).json({ error: "Authentication required." });
    request.user = user;
    return next();
  }

  function createSession(userId, response) {
    const token = randomBytes(32).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(hashToken(token), userId, now + SESSION_TTL_SECONDS, new Date().toISOString());
    setSessionCookie(response, token, secureCookies);
  }

  const limitAuthAttempts = createAuthRateLimiter(authLimit, authWindowMs);

  app.get("/api/auth/me", (request, response) => {
    const user = getCurrentUser(request);
    if (!user) return response.status(401).json({ error: "Authentication required." });
    return response.json({ user: publicUser(user) });
  });

  app.post("/api/auth/register", sameOrigin, limitAuthAttempts, async (request, response, next) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body.password === "string" ? request.body.password : "";
    if (name.length < 1 || name.length > 80) return response.status(400).json({ error: "Name must be 1 to 80 characters." });
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 10 || password.length > 128) return response.status(400).json({ error: "Password must be 10 to 128 characters." });

    try {
      const { hash, salt } = await hashPassword(password);
      const user = { id: randomUUID(), email, name, password_hash: hash, password_salt: salt, created_at: new Date().toISOString() };
      db.prepare("INSERT INTO users (id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(user.id, user.email, user.name, user.password_hash, user.password_salt, user.created_at);
      createSession(user.id, response);
      return response.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "An account with this email already exists." });
      return next(error);
    }
  });

  app.post("/api/auth/login", sameOrigin, limitAuthAttempts, async (request, response, next) => {
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body.password === "string" ? request.body.password : "";
    if (email.length > 254 || password.length > 128) return response.status(400).json({ error: "Invalid email or password." });
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      const passwordMatches = user
        ? await verifyPassword(password, user.password_hash, user.password_salt)
        : await verifyPassword(password || "invalid-password", "00".repeat(64), "00".repeat(16));
      if (!user || !passwordMatches) return response.status(401).json({ error: "Email or password is incorrect." });
      createSession(user.id, response);
      return response.json({ user: publicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/logout", sameOrigin, (request, response) => {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    clearSessionCookie(response, secureCookies);
    return response.status(204).end();
  });

  app.patch("/api/profile", sameOrigin, requireAuth, (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    if (name.length < 1 || name.length > 80) return response.status(400).json({ error: "Name must be 1 to 80 characters." });
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, request.user.id);
    return response.json({ user: { ...publicUser(request.user), name } });
  });

  app.get("/api/summary", requireAuth, (request, response) => {
    const userId = request.user.id;
    const projects = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE user_id = ?").get(userId).count;
    const checkins = db.prepare("SELECT COUNT(*) AS count FROM checkins WHERE user_id = ?").get(userId).count;
    const challenges = db.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE user_id = ?").get(userId).count;
    const lessons = db.prepare("SELECT COUNT(*) AS count FROM learning_progress WHERE user_id = ?").get(userId).count;
    return response.json({ projects, checkins, challenges, lessons });
  });

  app.get("/api/export", requireAuth, (request, response) => {
    const userId = request.user.id;
    const projects = db.prepare(`
      SELECT id, title, description, status, created_at AS createdAt, updated_at AS updatedAt
      FROM projects WHERE user_id = ? ORDER BY created_at
    `).all(userId);
    const checkins = db.prepare(`
      SELECT date, mood, reflection, created_at AS createdAt
      FROM checkins WHERE user_id = ? ORDER BY date
    `).all(userId);
    const challenges = db.prepare(`
      SELECT date, completed_at AS completedAt
      FROM challenge_completions WHERE user_id = ? ORDER BY date
    `).all(userId);
    const lessons = db.prepare(`
      SELECT lesson_id AS id, completed_at AS completedAt
      FROM learning_progress WHERE user_id = ? ORDER BY completed_at
    `).all(userId);
    return response.json({
      exportedAt: new Date().toISOString(),
      user: publicUser(request.user),
      projects,
      checkins,
      challenges,
      lessons,
      empty: projects.length + checkins.length + challenges.length + lessons.length === 0
    });
  });

  app.get("/api/projects", requireAuth, (request, response) => {
    const projects = db.prepare(`
      SELECT id, title, description, status, created_at AS createdAt, updated_at AS updatedAt
      FROM projects WHERE user_id = ? ORDER BY updated_at DESC
    `).all(request.user.id);
    return response.json({ projects });
  });

  app.post("/api/projects", sameOrigin, requireAuth, (request, response) => {
    const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
    const description = typeof request.body.description === "string" ? request.body.description.trim() : "";
    if (title.length < 1 || title.length > 120) return response.status(400).json({ error: "Project title must be 1 to 120 characters." });
    if (description.length > 1000) return response.status(400).json({ error: "Project description must be no more than 1000 characters." });
    const timestamp = new Date().toISOString();
    const project = { id: randomUUID(), title, description, status: "planned", createdAt: timestamp, updatedAt: timestamp };
    db.prepare("INSERT INTO projects (id, user_id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(project.id, request.user.id, title, description, project.status, timestamp, timestamp);
    return response.status(201).json({ project });
  });

  app.patch("/api/projects/:id", sameOrigin, requireAuth, (request, response) => {
    const { id } = request.params;
    const current = db.prepare("SELECT id, title, description, status FROM projects WHERE id = ? AND user_id = ?").get(id, request.user.id);
    if (!current) return response.status(404).json({ error: "Project not found." });
    const title = request.body.title === undefined ? current.title : (typeof request.body.title === "string" ? request.body.title.trim() : null);
    const description = request.body.description === undefined ? current.description : (typeof request.body.description === "string" ? request.body.description.trim() : null);
    const status = request.body.status === undefined ? current.status : request.body.status;
    if (title === null || title.length < 1 || title.length > 120) return response.status(400).json({ error: "Project title must be 1 to 120 characters." });
    if (description === null || description.length > 1000) return response.status(400).json({ error: "Project description must be no more than 1000 characters." });
    if (!PROJECT_STATUSES.has(status)) return response.status(400).json({ error: "Invalid project status." });
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE projects SET title = ?, description = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(title, description, status, updatedAt, id, request.user.id);
    return response.json({ project: { id, title, description, status, updatedAt } });
  });

  app.delete("/api/projects/:id", sameOrigin, requireAuth, (request, response) => {
    const result = db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(request.params.id, request.user.id);
    if (!result.changes) return response.status(404).json({ error: "Project not found." });
    return response.status(204).end();
  });

  app.get("/api/checkins", requireAuth, (request, response) => {
    const checkins = db.prepare(`
      SELECT id, date, mood, reflection, created_at AS createdAt
      FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 30
    `).all(request.user.id);
    return response.json({ checkins });
  });

  app.post("/api/checkins", sameOrigin, requireAuth, (request, response) => {
    const { mood, reflection = "", date = new Date().toISOString().slice(0, 10) } = request.body;
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) return response.status(400).json({ error: "Choose a mood from 1 to 5." });
    if (typeof reflection !== "string" || reflection.length > 500) return response.status(400).json({ error: "Reflection must be no more than 500 characters." });
    if (!validDate(date)) return response.status(400).json({ error: "Check-in date must be a valid calendar date." });
    const timestamp = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO checkins (id, user_id, date, mood, reflection, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET mood = excluded.mood, reflection = excluded.reflection, created_at = excluded.created_at
    `).run(id, request.user.id, date, mood, reflection.trim(), timestamp);
    const checkin = db.prepare("SELECT id, date, mood, reflection, created_at AS createdAt FROM checkins WHERE user_id = ? AND date = ?")
      .get(request.user.id, date);
    return response.status(201).json({ checkin });
  });

  app.get("/api/challenges", requireAuth, (request, response) => {
    const completions = db.prepare("SELECT date FROM challenge_completions WHERE user_id = ? ORDER BY date DESC LIMIT 90").all(request.user.id);
    return response.json({ dates: completions.map((item) => item.date) });
  });

  app.post("/api/challenges/:date", sameOrigin, requireAuth, (request, response) => {
    const { date } = request.params;
    if (!validDate(date)) return response.status(400).json({ error: "Challenge date must be a valid calendar date." });
    db.prepare("INSERT OR IGNORE INTO challenge_completions (user_id, date, completed_at) VALUES (?, ?, ?)")
      .run(request.user.id, date, new Date().toISOString());
    return response.status(204).end();
  });

  app.delete("/api/challenges/:date", sameOrigin, requireAuth, (request, response) => {
    if (!validDate(request.params.date)) return response.status(400).json({ error: "Challenge date must be a valid calendar date." });
    db.prepare("DELETE FROM challenge_completions WHERE user_id = ? AND date = ?").run(request.user.id, request.params.date);
    return response.status(204).end();
  });

  app.get("/api/learning", requireAuth, (request, response) => {
    const lessons = db.prepare("SELECT lesson_id AS id, completed_at AS completedAt FROM learning_progress WHERE user_id = ?").all(request.user.id);
    return response.json({ completed: lessons });
  });

  app.post("/api/learning/:lessonId", sameOrigin, requireAuth, (request, response) => {
    const { lessonId } = request.params;
    if (!LESSON_IDS.has(lessonId)) return response.status(404).json({ error: "Lesson not found." });
    db.prepare("INSERT OR IGNORE INTO learning_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)")
      .run(request.user.id, lessonId, new Date().toISOString());
    return response.status(204).end();
  });

  app.delete("/api/learning/:lessonId", sameOrigin, requireAuth, (request, response) => {
    if (!LESSON_IDS.has(request.params.lessonId)) return response.status(404).json({ error: "Lesson not found." });
    db.prepare("DELETE FROM learning_progress WHERE user_id = ? AND lesson_id = ?").run(request.user.id, request.params.lessonId);
    return response.status(204).end();
  });

  app.post("/api/migrate-local", sameOrigin, requireAuth, (request, response) => {
    const { checkin, challengeDate } = request.body;
    const result = { checkin: false, challenge: false };
    const importTransaction = db.transaction(() => {
      if (checkin && Number.isInteger(checkin.mood) && checkin.mood >= 1 && checkin.mood <= 5 &&
          typeof checkin.reflection === "string" && checkin.reflection.length <= 500 && validDate(checkin.date)) {
        const importResult = db.prepare(`
          INSERT OR IGNORE INTO checkins (id, user_id, date, mood, reflection, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), request.user.id, checkin.date, checkin.mood, checkin.reflection, new Date().toISOString());
        result.checkin = importResult.changes > 0;
      }
      if (typeof challengeDate === "string" && validDate(challengeDate)) {
        const importResult = db.prepare(`
          INSERT OR IGNORE INTO challenge_completions (user_id, date, completed_at)
          VALUES (?, ?, ?)
        `).run(request.user.id, challengeDate, new Date().toISOString());
        result.challenge = importResult.changes > 0;
      }
    });
    importTransaction();
    return response.json(result);
  });

  app.use("/api", (request, response) => response.status(404).json({ error: "API route not found." }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return response.status(400).json({ error: "Request body must be valid JSON." });
    }
    console.error("Request failed", error);
    return response.status(500).json({ error: "The request could not be completed." });
  });

  return app;
}

module.exports = { createApp };
