const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { createBike, addBikeImages, getBikeById, listBikes } = require("../models/bikeModel");

router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 50);
    const status = req.query.status || undefined;
    res.json(await listBikes({ status, page, pageSize }));
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const bike = await getBikeById(req.params.id);
    if (!bike) return res.status(404).json({ error: "Bike not found" });
    res.json({ bike });
  } catch (err) { next(err); }
});

router.post("/", upload.fields([
  { name: "bikePhotos", maxCount: 8 },
  { name: "rcDocument", maxCount: 1 },
]), async (req, res, next) => {
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
