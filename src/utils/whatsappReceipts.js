const ranks={sent:1,failed:2,delivered:3,read:4};
async function applyReceipt(pool,id){
  await pool.query(`UPDATE dealer_whatsapp_outbox o JOIN dealer_whatsapp_receipts r ON r.message_id=o.message_id
    SET o.state=r.state,o.last_error=r.last_error,o.updated_at=UTC_TIMESTAMP(3)
    WHERE o.message_id=? AND FIELD(o.state,'sent','failed','delivered','read')<=r.status_rank`,[id]);
}
async function recordReceipt(pool,status){
  if(!Object.hasOwn(ranks,status.status)||typeof status.id!=='string'||status.id.length>190)return;
  const error=status.status==='failed'?String(status.errors?.[0]?.code||'DELIVERY_FAILED').slice(0,100):null;
  await pool.query(`INSERT INTO dealer_whatsapp_receipts (message_id,state,status_rank,last_error,updated_at)
    VALUES (?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE
    state=IF(VALUES(status_rank)>=status_rank,VALUES(state),state),
    last_error=IF(VALUES(status_rank)>=status_rank,VALUES(last_error),last_error),
    status_rank=GREATEST(status_rank,VALUES(status_rank)),updated_at=UTC_TIMESTAMP(3)`,[status.id,status.status,ranks[status.status],error]);
  await applyReceipt(pool,status.id);
}
module.exports={applyReceipt,recordReceipt};
