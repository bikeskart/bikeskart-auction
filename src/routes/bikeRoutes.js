const {requireAdminScope}=require("../middleware/adminPermissions");
const {parseSale}=require("../utils/bikeSale");
const express = require("express");
const router = express.Router();
const {parseProfile}=require("../utils/bikeProfile");
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
  try{parseProfile(req.body);parseSale(req.body);}catch(e){return fail(e.message);}
  if(String(req.body.conditionNotes||'').length>10000)return fail("Description is too long");
  next();
}

router.use(requireAuth, requireRole("admin"));

router.use(requireAdminScope("inventory"));
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 50);
    const status = req.query.status || undefined;
    const data=await listBikes({ status, includeBuyer:req.adminPermissions.includes("owner"), search:String(req.query.search||" ").trim().slice(0,150), page, pageSize });
    res.json({...data,rows:data.rows.map(b=>require("../utils/adminOperations").privateBike(b,req.adminPermissions.includes("owner")))});
  } catch (err) { next(err); }
});

router.get("/:id/evidence/:filename", requireAdminScope("owner"), async(req,res,next)=>{
 try{const bike=await getBikeById(req.params.id);const document=bike?.sale_profile?.documents?.find(d=>d.filename===req.params.filename);if(!document)return res.status(404).json({error:"Document not found"});res.set('Cache-Control','no-store');res.sendFile(require('path').join(upload.uploadRoot,'rc',document.filename),err=>{if(err)next(err);});}catch(err){next(err);}
});

router.get("/:id/rc", requireAdminScope("owner"), async (req, res, next) => {
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
    if(req.adminPermissions.includes('owner')){try{const [[source]]=await require('../config/db').query('SELECT p.id,p.inspection_at,p.location,u.full_name AS executive_name FROM bike_purchases p LEFT JOIN users u ON u.id=p.assigned_to WHERE p.bike_id=?',[bike.id]);if(source)bike.purchase_source=source;}catch(e){if(e.code!=='ER_NO_SUCH_TABLE')throw e;}}
    res.json({ bike:require("../utils/adminOperations").privateBike(bike,req.adminPermissions.includes("owner")) });
  } catch (err) { next(err); }
});

router.put("/:id", upload.fields([
  { name: "bikePhotos", maxCount: 8 },
  { name: "rcDocument", maxCount: 1 },
  { name: "deliveryPhoto", maxCount: 1 },
  { name: "saleReceipt", maxCount: 1 },
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
    const sale=parseSale(req.body,existing.sale_profile);
    if(!req.adminPermissions.includes('owner')&&(Object.keys(req.body).some(k=>['buyerName','buyerBusiness','buyerPhone','buyerEmail','saleDate','salePrice','paymentReceived','paymentMethod','paymentDate','paymentReference','deliveryDate'].includes(k))||req.files?.deliveryPhoto?.length||req.files?.saleReceipt?.length||req.files?.rcDocument?.length)){for(const files of Object.values(req.files||{}))for(const f of files)require('fs').unlink(f.path,()=>{});return res.status(403).json({error:'Only the main admin can change private sale, payment and delivery records'});}
    const accountFields=['buyerName','buyerBusiness','buyerPhone','buyerEmail','saleDate','salePrice','paymentReceived','paymentMethod','paymentDate','paymentReference'];
    if(accountFields.some(k=>String(sale[k]??'')!==String(existing.sale_profile?.[k]??''))&&!req.adminPermissions.includes('accounts'))return res.status(403).json({error:'Accounts access required to change buyer or payment details'});
    if(['salePrice','paymentReceived','paymentMethod','paymentDate','paymentReference'].some(k=>String(sale[k]??'')!==String(existing.sale_profile?.[k]??'')))sale.paymentConfirmed=false;
    if(req.files?.saleReceipt?.length)sale.receiptSigned=false;
    const [[winning]]=await require('../config/db').query("SELECT highest_bid FROM auctions WHERE bike_id=? AND result='sold' ORDER BY id DESC LIMIT 1",[bikeId]);
    sale.documents=[...(existing.sale_profile?.documents||[])];
    for(const kind of ['deliveryPhoto','saleReceipt']){const file=req.files?.[kind]?.[0];if(file)sale.documents.push({kind,filename:file.filename,uploadedAt:new Date().toISOString(),uploadedBy:String(req.user.sub)});}
    require("../utils/adminOperations").validateRelease(sale,winning?.highest_bid);
    await updateBike(bikeId,{brand,model,year,registration_number:String(req.body.registrationNumber||"").trim()||null,kilometers_driven:req.body.kilometersDriven===""?null:Number(req.body.kilometersDriven),ownership_count:req.body.ownershipCount===""?null:Number(req.body.ownershipCount),fuel_type:String(req.body.fuelType||"").trim()||null,condition_notes:String(req.body.conditionNotes||"").trim()||null,detail_profile:JSON.stringify(parseProfile(req.body,existing.detail_profile)),sale_profile:JSON.stringify(sale),status});
    await addBikeImages(bikeId,photos.map(f=>`/uploads/bikes/${f.filename}`));
    if(rc) { const pool = require("../config/db"); await pool.query("UPDATE bikes SET rc_document_url = ? WHERE id = ?", [`/uploads/rc/${rc.filename}`, bikeId]); }
    await require("../utils/adminOperations").audit(require("../config/db"),req.user.sub,"bike.update",bikeId,{before:existing,after:await getBikeById(bikeId)});
    res.json({bike:require("../utils/adminOperations").privateBike(await getBikeById(bikeId),req.adminPermissions.includes("owner"))});
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
      detailProfile:parseProfile(req.body),
    });
    await addBikeImages(bikeId, imageUrls);
    await require("../utils/adminOperations").audit(require("../config/db"),req.user.sub,"bike.create",bikeId,{brand,model,year});
    res.status(201).json({ bike:require("../utils/adminOperations").privateBike(await getBikeById(bikeId),req.adminPermissions.includes("owner")) });
  } catch (err) { next(err); }
});

module.exports = router;
