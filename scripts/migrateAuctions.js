// Run explicitly after reviewing database/migrations/002_auctions.sql.
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/db');
(async () => {
  const connection = await pool.getConnection();
  try {
    for (const table of ['users','bikes','bike_images']) await connection.query(`SELECT 1 FROM ${table} LIMIT 1`);
    const [columns] = await connection.query("SELECT TABLE_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'id' AND TABLE_NAME IN ('users','bikes')");
    const types = Object.fromEntries(columns.map(c => [c.TABLE_NAME,c.COLUMN_TYPE]));
    for (const table of ['users','bikes']) if (!/^(?:tinyint|smallint|mediumint|int|bigint)(?:\(\d+\))?(?: unsigned)?$/i.test(types[table] || '')) throw new Error(`Unsupported ${table}.id type. Review the migration before applying.`);
    // Existing installations may use INT IDs rather than the reference BIGINT IDs.
    // Foreign-key column types must exactly match the referenced table.
    const sql = fs.readFileSync(path.join(__dirname,'../database/migrations/002_auctions.sql'),'utf8')
      .replace(/bike_id BIGINT UNSIGNED NOT NULL/g,`bike_id ${types.bikes} NOT NULL`)
      .replace(/(created_by|highest_bidder_id|winner_id|bidder_id) BIGINT UNSIGNED/g,(_,name) => `${name} ${types.users}`);
    for (const statement of sql.replace(/^--.*$/gm,'').split(';').map(s => s.trim()).filter(Boolean)) await connection.query(statement);
    console.log('Auction tables are ready. Existing vehicle and account data was retained.');
  } finally { connection.release(); await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
