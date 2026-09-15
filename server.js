const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const env = require("./src/config/env");
const db = require("./src/config/db");
const authRoutes = require("./src/routes/authRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const bikeRoutes = require("./src/routes/bikeRoutes");

const app = express();

/*
 * Upload directory
 *
 * This MUST match the directory used by:
 * src/middleware/upload.js
 *
 * upload.js uses:
 * path.resolve(__dirname, "../../public_html/uploads")
 *
 * Since server.js is in the project root, the equivalent path is:
 * path.resolve(__dirname, "public_html/uploads")
 */
const uploadRoot = path.resolve(__dirname, "uploads");
app.use(helmet());

app.use(
  cors({
    origin:
      env.nodeEnv === "production"
        ? "https://auction.bikeskart.com"
        : true,
    credentials: true,
  })
);

app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
 * Authentication routes
 * DO NOT change these.
 */
app.use("/api/auth", authRoutes);

/*
 * Admin routes
 */
app.use("/api/admin", adminRoutes);

/*
 * Admin bike routes
 */
app.use("/api/admin/bikes", bikeRoutes);

/*
 * Uploaded bike photos and RC documents.
 *
 * This now serves the SAME physical directory used by upload.js.
 */
app.use("/uploads", express.static(uploadRoot));

/*
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "bikeskart-auction",
  });
});

/*
 * Database health check
 */
app.get("/health/db", async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");

    res.json({
      ok: true,
      database: "connected",
      result: rows[0].ok,
    });
  } catch (err) {
    next(err);
  }
});

/*
 * Serve the auction application itself.
 */
app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/*
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    error:
      env.nodeEnv === "production"
        ? "Something went wrong"
        : err.message,
  });
});

/*
 * Start server
 */
app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `BikesKart Auction running on port ${env.port} [${env.nodeEnv}]`
  );
});
