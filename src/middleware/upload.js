const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadRoot = path.resolve(__dirname, "../../public_html/uploads");
const bikePhotosDir = path.join(uploadRoot, "bikes");
const rcDocsDir = path.join(uploadRoot, "rc");
fs.mkdirSync(bikePhotosDir, { recursive: true });
fs.mkdirSync(rcDocsDir, { recursive: true });

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const rcTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function safeName(original) {
  const ext = path.extname(original || "").toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, file.fieldname === "rcDocument" ? rcDocsDir : bikePhotosDir);
  },
  filename(req, file, cb) {
    cb(null, safeName(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "bikePhotos" && imageTypes.has(file.mimetype)) return cb(null, true);
  if (file.fieldname === "rcDocument" && rcTypes.has(file.mimetype)) return cb(null, true);
  cb(new Error("Unsupported file type"));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 9 },
});

module.exports.uploadRoot = uploadRoot;
