const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

/**
 * Access tokens: short-lived, sent on every request, never stored
 * server-side (that's the point of a stateless access token).
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

/**
 * Refresh tokens: long-lived. We store only a SHA-256 hash of the
 * token in the DB (refresh_tokens.token_hash), so a leaked database
 * dump alone can't be used to forge sessions — same principle as
 * never storing plaintext passwords.
 */
function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
};
