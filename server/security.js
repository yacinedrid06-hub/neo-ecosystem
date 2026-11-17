const { createHash, randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "neo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(request, name) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function setSessionCookie(response, token, secure) {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (secure) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(response, secure) {
  const attributes = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

async function hashPassword(password, salt = randomBytes(16)) {
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { hash: derived.toString("hex"), salt: salt.toString("hex") };
}

async function verifyPassword(password, hash, salt) {
  const derived = await hashPassword(password, Buffer.from(salt, "hex"));
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(derived.hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  hashPassword,
  hashToken,
  readCookie,
  setSessionCookie,
  verifyPassword
};
