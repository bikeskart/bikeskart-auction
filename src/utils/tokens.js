const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

/**
 * Access tokens: short-lived, sent on every request, never stored
 * server-side (that's the point of a stateless access token).
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, token_use: "access" },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwt.accessSecret);
  if (payload.token_use !== "access") throw new Error("Invalid token type");
  return payload;
}

/**
 * Refresh tokens: long-lived. We store only a SHA-256 hash of the
 * token in the DB (refresh_tokens.token_hash), so a leaked database
 * dump alone can't be used to forge sessions — same principle as
 * never storing plaintext passwords.
 */
function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, token_use: "refresh", jti: crypto.randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.jwt.refreshSecret);
  if (payload.token_use !== "refresh") throw new Error("Invalid token type");
  return payload;
}

// This credential only permits push-device registration; it cannot log in or bid.
function signPendingPushToken(user) {
  return jwt.sign({sub:user.id,token_use:'pending_push'},env.jwt.accessSecret,{expiresIn:'30d'});
}
function verifyPendingPushToken(token) {
  const value=jwt.verify(token,env.jwt.accessSecret);
  if(value.token_use!=='pending_push') throw new Error('Invalid token type');
  return value;
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
  signPendingPushToken,
  verifyPendingPushToken,
};
