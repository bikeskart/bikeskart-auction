const pending=new WeakMap();
const fields={buyerName:190,buyerBusiness:190,buyerPhone:20,buyerEmail:254,paymentReference:190};
const dates=['saleDate','deliveryDate','paymentDate'];
const amounts=['salePrice','paymentReceived'];
const methods=['Cash','UPI','Bank transfer','Card','Cheque','Mixed','Other'];
function parseSale(body,existing={}){
 const sale={...existing};
 for(const key of [...Object.keys(fields),...dates,...amounts,'paymentMethod']){
  if(!Object.hasOwn(body,key))continue;
  if(typeof body[key]!=='string'&&typeof body[key]!=='number')throw new Error('Invalid '+key);
  const value=String(body[key]).trim();
  if(!value){sale[key]=null;continue;}
  if(fields[key]&&value.length>fields[key])throw new Error(key+' is too long');
  if(dates.includes(key)&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new Error('Invalid '+key);
  if(amounts.includes(key)&&(!/^\d{1,10}(\.\d{1,2})?$/.test(value)))throw new Error('Invalid '+key);
  if(key==='paymentMethod'&&!methods.includes(value))throw new Error('Invalid payment method');
  if(key==='buyerEmail'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error('Invalid buyer email');
  if(key==='buyerPhone'&&!/^\+?[\d ()-]{7,20}$/.test(value))throw new Error('Invalid buyer mobile');
  sale[key]=value;
 }
 return sale;
}
function readSale(raw){try{const data=typeof raw==='string'?JSON.parse(raw):raw||{};const sale=parseSale(data);sale.documents=Array.isArray(data.documents)?data.documents.filter(d=>['deliveryPhoto','saleReceipt'].includes(d.kind)&&/^\d+-[a-f0-9]{16}\.(jpg|png|webp|pdf)$/.test(d.filename)):[];return sale;}catch{return {};}}
async function ensureSale(pool){
 if(pending.has(pool))return pending.get(pool);
 const work=(async()=>{const [rows]=await pool.query('SHOW COLUMNS FROM bikes');if(!rows.some(r=>r.Field==='sale_profile'))try{await pool.query('ALTER TABLE bikes ADD COLUMN sale_profile LONGTEXT NULL');}catch(e){if(e.code!=='ER_DUP_FIELDNAME')throw e;}})();
 pending.set(pool,work);try{await work;}catch(e){pending.delete(pool);throw e;}
}
module.exports={parseSale,readSale,ensureSale};
