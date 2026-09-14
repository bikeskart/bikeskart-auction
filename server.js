const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "bikeskart-auction" });
});

app.get("/health/db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    res.json({ ok: true, database: "connected", result: rows[0].ok });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(500).json({
      ok: false,
      database: "connection_failed",
      message: "Database connection failed"
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BikesKart Auction running on port ${PORT}`);
});
