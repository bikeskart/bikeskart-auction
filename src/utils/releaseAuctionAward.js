const ops=require('./adminOperations');

async function releaseAward(pool,id,actor,reason){
 if(typeof reason!=='string'||reason.trim().length<5||reason.trim().length>1000)ops.error('Enter a reason between 5 and 1000 characters');
 const c=await pool.getConnection();
 try{await c.beginTransaction();
 const [[a]]=await c.query('SELECT * FROM auctions WHERE id=? FOR UPDATE',[id]);
 if(!a)ops.error('Auction not found',404);
 if(a.status!=='closed'||a.result!=='sold')ops.error('Only a completed winning bid can be released',409);
 const [[bike]]=await c.query('SELECT id,status,sale_profile FROM bikes WHERE id=? FOR UPDATE',[a.bike_id]);
 if(!bike)ops.error('Bike not found',404);
 let sale;try{sale=typeof bike.sale_profile==='string'?JSON.parse(bike.sale_profile):bike.sale_profile||{};}catch{ops.error('Invalid sale record. Review it before re-auctioning',409);}
 if(bike.status==='sold'||sale.deliveryReleased||sale.paymentConfirmed||(ops.cents(sale.paymentReceived)||0)>0||sale.saleDate||sale.deliveryDate||(ops.cents(sale.salePrice)||0)>0||(sale.documents||[]).some(d=>d.kind==='saleReceipt'||d.kind==='deliveryPhoto'))ops.error('Payment, sale or delivery is recorded. Resolve those records before re-auctioning',409);
 // Preserve the original award in the activity entry; bids are untouched.
 await ops.audit(c,actor,'auction.release-winning-bid',id,{reason:reason.trim(),previousAuction:a,result:'unsold',winnerId:null});
 await c.query("UPDATE auctions SET result='unsold',winner_id=NULL WHERE id=?",[id]);
 await c.query('DELETE FROM auction_confirmations WHERE auction_id=?',[id]);
 await c.commit();return {released:true};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={releaseAward};
