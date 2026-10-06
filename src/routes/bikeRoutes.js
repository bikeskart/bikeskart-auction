const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { createBike, addBikeImages, getBikeById, listBikes, updateBike } = require("../models/bikeModel");

function validateBike(req, res, next) {
  const fail = message => {
    for (const files of Object.values(req.files || {})) for (const file of files) require("fs").unlink(file.path, () => {});
    return res.status(400).json({ error: message });
  };
  const brand = String(req.body.brand || "").trim();
  const model = String(req.body.model || "").trim();
  if (!brand || !model || brand.length > 150 || model.length > 150) return fail("Brand and model must be between 1 and 150 characters");
  const year = Number(req.body.year);
  if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) return fail("Invalid bike year");
  for (const [key, min, max] of [["kilometersDriven", 0, 2147483647], ["ownershipCount", 1, 255]]) {
    const value = req.body[key];
    if (value != null && value !== "" && (!Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max)) return fail(`Invalid ${key}`);
    if (value == null) req.body[key] = "";
  }
  if (req.method === "PUT" && !["draft", "ready", "in_auction", "sold", "unsold"].includes(req.body.status || "draft")) return fail("Invalid bike status");
  next();
}

router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 50);
    const status = req.query.status || undefined;
    res.json(await listBikes({ status, page, pageSize }));
  } catch (err) { next(err); }
});

router.get("/:id/rc", async (req, res, next) => {
  try {
    const bike = await getBikeById(req.params.id);
    if (!bike || !bike.rc_document_url) return res.status(404).json({ error: "RC document not found" });
    const path = require("path");
    const filename = path.basename(bike.rc_document_url);
    if (bike.rc_document_url !== `/uploads/rc/${filename}`) return res.status(404).json({ error: "RC document not found" });
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(upload.uploadRoot, "rc", filename), err => { if (err) next(err); });
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const bike = await getBikeById(req.params.id);
    if (!bike) return res.status(404).json({ error: "Bike not found" });
    res.json({ bike });
  } catch (err) { next(err); }
});

router.put("/:id", upload.fields([
  { name: "bikePhotos", maxCount: 8 },
  { name: "rcDocument", maxCount: 1 },
]), validateBike, async (req, res, next) => {
  try {
    const bikeId = Number(req.params.id);
    if (!Number.isInteger(bikeId) || bikeId < 1) return res.status(400).json({ error: "Invalid bike ID" });
    const existing = await getBikeById(bikeId);
    if (!existing) return res.status(404).json({ error: "Bike not found" });
    const brand = String(req.body.brand || "").trim(); const model = String(req.body.model || "").trim(); const year = Number(req.body.year);
    if (!brand || !model || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear()+1) return res.status(400).json({error:"Brand, model and a valid year are required"});
    const status = String(req.body.status || "draft").trim().toLowerCase();
    const allowedStatus = new Set(["draft","ready","in_auction","sold","unsold"]);
    if (!allowedStatus.has(status)) return res.status(400).json({error:"Invalid bike status"});
    const photos=req.files?.bikePhotos||[]; const rc=req.files?.rcDocument?.[0];
    await updateBike(bikeId,{brand,model,year,registration_number:String(req.body.registrationNumber||"").trim()||null,kilometers_driven:req.body.kilometersDriven===""?null:Number(req.body.kilometersDriven),ownership_count:req.body.ownershipCount===""?null:Number(req.body.ownershipCount),fuel_type:String(req.body.fuelType||"").trim()||null,condition_notes:String(req.body.conditionNotes||"").trim()||null,status});
    await addBikeImages(bikeId,photos.map(f=>`/uploads/bikes/${f.filename}`));
    if(rc) { const pool = require("../config/db"); await pool.query("UPDATE bikes SET rc_document_url = ? WHERE id = ?", [`/uploads/rc/${rc.filename}`, bikeId]); }
    res.json({bike:await getBikeById(bikeId)});
  } catch(err){next(err);}
});

router.post("/", upload.fields([
  { name: "bikePhotos", maxCount: 8 },
  { name: "rcDocument", maxCount: 1 },
]), validateBike, async (req, res, next) => {
  try {
    const brand = String(req.body.brand || "").trim();
    const model = String(req.body.model || "").trim();
    const year = Number(req.body.year);
    if (!brand || !model || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: "Brand, model and a valid year are required" });
    }

    const photos = req.files?.bikePhotos || [];
    const rc = req.files?.rcDocument?.[0];
    const rcDocumentUrl = rc ? `/uploads/rc/${rc.filename}` : null;
    const imageUrls = photos.map((f) => `/uploads/bikes/${f.filename}`);

    const bikeId = await createBike({
      dealerId: req.user.sub,
      brand,
      model,
      year,
      registrationNumber: String(req.body.registrationNumber || "").trim() || null,
      kilometersDriven: req.body.kilometersDriven ? Number(req.body.kilometersDriven) : null,
      ownershipCount: req.body.ownershipCount ? Number(req.body.ownershipCount) : null,
      fuelType: String(req.body.fuelType || "").trim() || null,
      conditionNotes: String(req.body.conditionNotes || "").trim() || null,
      rcDocumentUrl,
    });
    await addBikeImages(bikeId, imageUrls);
    res.status(201).json({ bike: await getBikeById(bikeId) });
  } catch (err) { next(err); }
});

module.exports = router;
