const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const {uploadPaths} = require("../utils/uploadPaths");
const {uploadRoot} = uploadPaths(path.resolve(__dirname, "../.."), process.env.UPLOAD_ROOT);
const bikePhotosDir = path.join(uploadRoot, "bikes");
const rcDocsDir = path.join(uploadRoot, "rc");
fs.mkdirSync(bikePhotosDir, { recursive: true });
fs.mkdirSync(rcDocsDir, { recursive: true });

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const rcTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function safeName(original) {
  const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" }[original];
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, ["rcDocument","deliveryPhoto","saleReceipt"].includes(file.fieldname) ? rcDocsDir : bikePhotosDir);
  },
  filename(req, file, cb) {
    cb(null, safeName(file.mimetype));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "bikePhotos" && imageTypes.has(file.mimetype)) return cb(null, true);
  if (file.fieldname === "deliveryPhoto" && imageTypes.has(file.mimetype)) return cb(null, true);
  if (["rcDocument","saleReceipt"].includes(file.fieldname) && rcTypes.has(file.mimetype)) return cb(null, true);
  const error = new Error("Use JPG, PNG or WEBP for bike photos, and PDF, JPG, PNG or WEBP for RC documents and sale receipts. Delivery photos must be JPG, PNG or WEBP.");
  error.status = 400; error.expose = true; cb(error);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 11 },
});

module.exports.uploadRoot = uploadRoot;
