const pool = require("../config/db");

async function createBike({
  dealerId,
  brand,
  model,
  year,
  registrationNumber,
  kilometersDriven,
  ownershipCount,
  fuelType,
  conditionNotes,
  rcDocumentUrl,
}) {
  const [result] = await pool.query(
    `INSERT INTO bikes
      (dealer_id, brand, model, year, registration_number, kilometers_driven,
       ownership_count, fuel_type, condition_notes, rc_document_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [
      dealerId,
      brand,
      model,
      year,
      registrationNumber || null,
      kilometersDriven ?? null,
      ownershipCount ?? null,
      fuelType || null,
      conditionNotes || null,
      rcDocumentUrl || null,
    ]
  );
  return result.insertId;
}

async function addBikeImages(bikeId, imageUrls) {
  if (!imageUrls.length) return;
  const values = imageUrls.map((url, i) => [bikeId, url, i]);
  await pool.query(
    "INSERT INTO bike_images (bike_id, image_url, sort_order) VALUES ?",
    [values]
  );
}

async function getBikeById(bikeId) {
  const [bikeRows] = await pool.query("SELECT * FROM bikes WHERE id = ?", [bikeId]);
  const bike = bikeRows[0];
  if (!bike) return null;
  const [images] = await pool.query(
    "SELECT id, image_url, sort_order FROM bike_images WHERE bike_id = ? ORDER BY sort_order",
    [bikeId]
  );
  return { ...bike, images };
}

async function listBikes({ status, page = 1, pageSize = 20 } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT b.*,
            (SELECT image_url FROM bike_images bi WHERE bi.bike_id = b.id ORDER BY sort_order LIMIT 1) AS cover_image
     FROM bikes b ${where}
     ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM bikes b ${where}`, params);
  return { rows, total, page, pageSize };
}

async function updateBike(bikeId, fields) {
  const allowed = ["brand","model","year","registration_number","kilometers_driven","ownership_count","fuel_type","condition_notes","status"];
  const setClauses=[]; const params=[];
  for (const [key,value] of Object.entries(fields)) { if (allowed.includes(key)) { setClauses.push(`${key} = ?`); params.push(value); } }
  if (!setClauses.length) return getBikeById(bikeId);
  params.push(bikeId);
  await pool.query(`UPDATE bikes SET ${setClauses.join(", ")} WHERE id = ?`, params);
  return getBikeById(bikeId);
}

module.exports = { createBike, addBikeImages, getBikeById, listBikes, updateBike };
