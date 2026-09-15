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

app.use(helmet());
app.use(cors({
  origin: env.nodeEnv === "production" ? "https://auction.bikeskart.com" : true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/bikes", bikeRoutes);

// Uploaded bike photos/RC documents live in the persistent public_html area.
app.use("/uploads", express.static(path.resolve(__dirname, "public_html/uploads")));
app.get("/health", (req, res) => res.json({ ok: true, service: "bikeskart-auction" }));
app.get("/health/db", async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    res.json({ ok: true, database: "connected", result: rows[0].ok });
  } catch (err) { next(err); }
});

app.use(express.static(__dirname));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: env.nodeEnv === "production" ? "Something went wrong" : err.message,
  });
});

app.listen(env.port, "0.0.0.0", () =>
  console.log(`BikesKart Auction running on port ${env.port} [${env.nodeEnv}]`)
);
