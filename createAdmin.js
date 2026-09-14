const pool = require("../src/config/db");
const { hashPassword } = require("../src/utils/password");

async function main() {
  const [fullName, email, password] = process.argv.slice(2);
  if (!fullName || !email || !password) {
    console.error('Usage: node scripts/createAdmin.js "Full Name" "email@example.com" "Password123"');
    process.exit(1);
  }
  if (password.length < 8 || !/\d/.test(password)) {
    console.error("Password must be at least 8 characters and contain a number.");
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  await pool.execute(
    `INSERT INTO users (role, full_name, email, password_hash, is_verified, is_active)
     VALUES ('admin', ?, ?, ?, 1, 1)`, [fullName, email.toLowerCase(), passwordHash]
  );
  console.log(`Admin account created for ${email}`);
  await pool.end();
}
main().catch(async (err) => {
  console.error("Failed to create admin:", err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
