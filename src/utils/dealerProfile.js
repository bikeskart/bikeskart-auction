// Older installations lack optional profile columns. Add only missing columns;
// never discard a submitted mobile number through a lean-schema fallback.
const pending=new WeakMap();
async function ensureDealerProfile(pool){
  if(pending.has(pool))return pending.get(pool);
  const work=(async()=>{
    const [rows]=await pool.query('SHOW COLUMNS FROM users');
    for(const [name,type] of [['phone','VARCHAR(20)'],['business_name','VARCHAR(190)'],['gst_number','VARCHAR(20)']]){
      if(rows.some(row=>row.Field===name))continue;
      try{await pool.query(`ALTER TABLE users ADD COLUMN ${name} ${type} NULL`);}catch(error){if(error.code!=='ER_DUP_FIELDNAME')throw error;}
    }
  })();pending.set(pool,work);
  try{await work;}catch(error){pending.delete(pool);throw error;}
}
module.exports={ensureDealerProfile};
