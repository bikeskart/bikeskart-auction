const db = require("../config/db");

async function findByEmail(email) {
  const [rows] = await db.execute(
    `SELECT id, role, full_name, email, password_hash, is_active, is_verified,
            last_login_at, created_at
       FROM users WHERE email = ? LIMIT 1`, [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await db.execute(
    `SELECT id, role, full_name, email, is_active, is_verified,
            last_login_at, created_at
       FROM users WHERE id = ? LIMIT 1`, [id]
  );
  return rows[0] || null;
}

async function createUser({ role, fullName, email, phone, passwordHash, businessName, gstNumber }) {
  // Try the full Stage-1 profile first. If the already-created database uses
  // the leaner users table, fall back to the common core columns.
  try {
    const [result] = await db.execute(
      `INSERT INTO users
       (role, full_name, email, phone, password_hash, business_name, gst_number, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      [role, fullName, email, phone || null, passwordHash,
       role === "dealer" ? (businessName || null) : null,
       role === "dealer" ? (gstNumber || null) : null]
    );
    return findById(result.insertId);
  } catch (err) {
    if (err && err.code !== "ER_BAD_FIELD_ERROR" && err && err.code !== "ER_BAD_COLUMN_ERROR") throw err;
    const [result] = await db.execute(
      `INSERT INTO users (role, full_name, email, password_hash, is_verified, is_active)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [role, fullName, email, passwordHash]
    );
    return findById(result.insertId);
  }
}

async function updateLastLogin(id) {
  await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [id]);
}

async function storeRefreshToken(userId, tokenHash, expiresAt) {
  await db.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt]
  );
}

async function findValidRefreshToken(tokenHash) {
  const [rows] = await db.execute(
    `SELECT id, user_id, token_hash, expires_at, revoked_at
       FROM refresh_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
      LIMIT 1`, [tokenHash]
  );
  return rows[0] || null;
}

async function revokeRefreshToken(tokenHash) {
  await db.execute(
    `UPDATE refresh_tokens SET revoked_at = NOW()
      WHERE token_hash = ? AND revoked_at IS NULL`, [tokenHash]
  );
}

module.exports = {
  findByEmail, findById, createUser, updateLastLogin,
  storeRefreshToken, findValidRefreshToken, revokeRefreshToken,
};
