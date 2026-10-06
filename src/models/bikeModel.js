const {ensureSale,readSale}=require("../utils/bikeSale");
const {ensureDealerProfile}=require("../utils/dealerProfile");
const pool = require("../config/db");
const {ensureBikeProfile,readProfile}=require("../utils/bikeProfile");

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
  detailProfile={},
}) {
  await ensureBikeProfile(pool);
  const [result] = await pool.query(
    `INSERT INTO bikes
      (dealer_id, brand, model, year, registration_number, kilometers_driven,
       ownership_count, fuel_type, condition_notes, rc_document_url, detail_profile, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
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
      JSON.stringify(detailProfile),
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
  await ensureSale(pool);
  const [bikeRows] = await pool.query("SELECT * FROM bikes WHERE id = ?", [bikeId]);
  const bike = bikeRows[0];
  if (!bike) return null;
  const [images] = await pool.query(
    "SELECT id, image_url, sort_order FROM bike_images WHERE bike_id = ? ORDER BY sort_order",
    [bikeId]
  );
  return { ...bike, detail_profile:readProfile(bike.detail_profile), sale_profile:readSale(bike.sale_profile), images };
}

async function listBikes({ status, search="", page = 1, pageSize = 20 } = {}) {
  await ensureSale(pool);
  await ensureDealerProfile(pool);
  const join = `LEFT JOIN auctions a ON a.id=(SELECT MAX(ax.id) FROM auctions ax WHERE ax.bike_id=b.id AND ax.result='sold' AND ax.winner_id IS NOT NULL) LEFT JOIN users u ON u.id=a.winner_id`;
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("b.status = ?");
    params.push(status);
  }
  if(search){
    const value='%'+search+'%';
    const columns=['CAST(b.id AS CHAR)','b.brand','b.model','b.registration_number','u.full_name','u.email','u.phone','u.business_name',...['buyerName','buyerBusiness','buyerPhone','buyerEmail'].map(key=>`JSON_UNQUOTE(JSON_EXTRACT(b.sale_profile, '$.${key}'))`)];
    conditions.push('('+columns.map(c=>c+' LIKE ?').join(' OR ')+')');params.push(...columns.map(()=>value));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT b.*, a.closed_at AS auction_closed_at, a.highest_bid AS winning_price, u.full_name AS buyer_name, u.phone AS buyer_phone, u.email AS buyer_email, u.business_name AS buyer_business,
            (SELECT image_url FROM bike_images bi WHERE bi.bike_id = b.id ORDER BY sort_order LIMIT 1) AS cover_image
     FROM bikes b ${join} ${where}
     ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM bikes b ${join} ${where}`, params);
  return { rows:rows.map(b=>({...b,sale_profile:readSale(b.sale_profile),financial:require("../utils/adminOperations").financial(readSale(b.sale_profile),b.winning_price)})), total, page, pageSize };
}

async function updateBike(bikeId, fields) {
  await ensureBikeProfile(pool);
  await ensureSale(pool);
  const allowed = ["brand","model","year","registration_number","kilometers_driven","ownership_count","fuel_type","condition_notes","detail_profile","sale_profile","status"];
  const setClauses=[]; const params=[];
  for (const [key,value] of Object.entries(fields)) { if (allowed.includes(key)) { setClauses.push(`${key} = ?`); params.push(value); } }
  if (!setClauses.length) return getBikeById(bikeId);
  params.push(bikeId);
  await pool.query(`UPDATE bikes SET ${setClauses.join(", ")} WHERE id = ?`, params);
  return getBikeById(bikeId);
}

module.exports = { createBike, addBikeImages, getBikeById, listBikes, updateBike };
