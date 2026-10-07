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
const auctionRoutes = require("./src/routes/auctionRoutes");
const accountRoutes = require("./src/routes/accountRoutes");
const auctions = require("./src/models/auctionModel");

const app = express();

const { uploadRoot } = require("./src/middleware/upload");
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
app.use("/api/admin-registration", require("./src/routes/adminRegistrationRoutes"));

/*
 * Admin routes
 */
app.use("/api/admin", adminRoutes);
app.use("/api/movements", require("./src/routes/movementRoutes"));
app.use("/api/admin/specialists", require("./src/routes/specialistRoutes"));
app.use("/api/purchases", require("./src/routes/purchaseRoutes"));
app.use("/api/admin/operations", require("./src/routes/operationRoutes"));
app.use("/api/admin/backups", require("./src/routes/backupRoutes"));

/*
 * Admin bike routes
 */
app.use("/api/admin/bike-import", require("./src/routes/bulkBikeRoutes"));
app.use("/api/admin/bikes", bikeRoutes);
app.use("/api/auctions", auctionRoutes);
app.use("/api/admin/accounts", accountRoutes);
app.use("/api/admin/winners", require("./src/routes/winnerRoutes"));
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/auctions') && err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({error:'Auctions are being prepared. Please try again later.'});
  }
  next(err);
});

/*
 * Uploaded bike photos and RC documents.
 *
 * This now serves the SAME physical directory used by upload.js.
 */
app.use("/uploads/bikes", express.static(path.join(uploadRoot, "bikes")));
app.use("/uploads/rc", (req, res) => res.status(404).json({ error: "Not found" }));

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
for (const file of ["index.html", "admin.html", "style.css", "app.js", "admin.js", "admin-ops.js", "admin-navigation.js", "specialist-admin.js", "admin-navigation.css", "purchase-admin.js", "movements.js", "executive.html", "executive.js", "auction.js", "auction.css"]) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
}
app.get(["/admin", ...["dashboard","vehicles","purchases","auctions","warehouse","accounts","people","reports"].map(page=>"/admin/"+page)],(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.get("/executive", (req,res)=>res.sendFile(path.join(__dirname,"executive.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get("*", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

/*
 * Global error handler
 */
app.use((err, req, res, next) => {
  if (err.name === "MulterError") {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Each upload must be 8 MB or smaller." : err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT" ? "Upload up to 8 bike photos, 1 RC document, 1 delivery photo and 1 sale receipt at a time." : "Could not accept the upload. Please check the selected files.";
    return res.status(400).json({error:message});
  }
  if (err.expose === true && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) return res.status(err.status).json({error:err.message});
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
if (require.main === module) app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `BikesKart Auction running on port ${env.port} [${env.nodeEnv}]`
  );
  const sweep = () => auctions.closeDue().catch(err => {
    if (err.code !== 'ER_NO_SUCH_TABLE') console.error('Auction closing failed:', err.code || err.message);
  });
  require("./src/utils/adminBackups").startScheduler(db);
  sweep();
  setInterval(sweep, 5000).unref();
});

module.exports = app;
