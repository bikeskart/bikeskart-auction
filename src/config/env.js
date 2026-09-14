require("dotenv").config();

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

// Hostinger currently has JWT_SECRET configured. The package also supports
// separate access/refresh secrets later without changing application code.
const jwtFallback = process.env.JWT_SECRET;
if (!process.env.JWT_ACCESS_SECRET && !jwtFallback) {
  throw new Error("Missing JWT_SECRET (or JWT_ACCESS_SECRET)");
}
if (!process.env.JWT_REFRESH_SECRET && !jwtFallback) {
  throw new Error("Missing JWT_SECRET (or JWT_REFRESH_SECRET)");
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 3000,
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || jwtFallback,
    refreshSecret: process.env.JWT_REFRESH_SECRET || jwtFallback,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
};
