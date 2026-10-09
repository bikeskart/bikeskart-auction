const ensuring=new WeakMap();
function ensureOutbidNotifications(pool) {
  if(!ensuring.has(pool))ensuring.set(pool,(async()=>{
    await pool.query(`CREATE TABLE IF NOT EXISTS dealer_outbid_events (
      bid_id BIGINT UNSIGNED PRIMARY KEY, auction_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS dealer_outbid_deliveries (
      bid_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      state ENUM('pending','processing','sent','skipped','failed') NOT NULL DEFAULT 'pending',
      attempts INT UNSIGNED NOT NULL DEFAULT 0, available_at DATETIME(3) NOT NULL,
      lease_until DATETIME(3) NULL, last_error VARCHAR(100) NULL,
      PRIMARY KEY (bid_id,token_hash), KEY outbid_ready (state,available_at)
    ) ENGINE=InnoDB`);
  })().catch(error=>{ensuring.delete(pool);throw error;}));
  return ensuring.get(pool);
}
async function queueOutbid(connection,auction,newBidId,bidderId) {
  if(auction.highest_bidder_id==null||String(auction.highest_bidder_id)===String(bidderId))return;
  await connection.query('INSERT INTO dealer_outbid_events (bid_id,auction_id,user_id,created_at) VALUES (?,?,?,UTC_TIMESTAMP(3))',[newBidId,auction.id,auction.highest_bidder_id]);
}
async function deliverOutbids(pool,sender,log) {
  await pool.query(`INSERT IGNORE INTO dealer_outbid_deliveries (bid_id,token_hash,available_at)
    SELECT e.bid_id,d.token_hash,UTC_TIMESTAMP(3) FROM dealer_outbid_events e
    JOIN dealer_push_devices d ON d.user_id=e.user_id
    JOIN users u ON u.id=e.user_id AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')
    JOIN auctions a ON a.id=e.auction_id AND a.status='open' AND a.ends_at>UTC_TIMESTAMP(3)
    WHERE a.highest_bidder_id<>e.user_id AND e.created_at>UTC_TIMESTAMP(3)-INTERVAL 1 DAY`);
  // Discard stale alerts when the dealer has regained the lead or the lot ended.
  await pool.query(`UPDATE dealer_outbid_deliveries p JOIN dealer_outbid_events e ON e.bid_id=p.bid_id
    LEFT JOIN auctions a ON a.id=e.auction_id LEFT JOIN users u ON u.id=e.user_id
    LEFT JOIN dealer_push_devices d ON d.token_hash=p.token_hash AND d.user_id=e.user_id
    SET p.state='skipped',p.lease_until=NULL WHERE p.state IN ('pending','processing')
    AND (a.id IS NULL OR a.status<>'open' OR a.ends_at<=UTC_TIMESTAMP(3) OR a.highest_bidder_id=e.user_id
    OR u.id IS NULL OR u.is_active<>1 OR u.is_verified<>1 OR d.token_hash IS NULL)`);
  const [rows]=await pool.query(`SELECT p.bid_id,p.token_hash,p.attempts,e.user_id,e.auction_id,d.fcm_token,b.brand,b.model,
    a.highest_bid,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(3),a.ends_at) AS ttl_seconds
    FROM dealer_outbid_deliveries p JOIN dealer_outbid_events e ON e.bid_id=p.bid_id
    JOIN auctions a ON a.id=e.auction_id JOIN bikes b ON b.id=a.bike_id
    JOIN dealer_push_devices d ON d.token_hash=p.token_hash AND d.user_id=e.user_id JOIN users u ON u.id=e.user_id
    WHERE (p.state='pending' OR (p.state='processing' AND p.lease_until<UTC_TIMESTAMP(3)))
    AND p.available_at<=UTC_TIMESTAMP(3) AND a.status='open' AND a.ends_at>UTC_TIMESTAMP(3)
    AND a.highest_bidder_id<>e.user_id AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder') LIMIT 50`);
  const selectedAt=Date.now();
  for(const row of rows){
    const key=[row.bid_id,row.token_hash];
    const [claim]=await pool.query(`UPDATE dealer_outbid_deliveries p JOIN dealer_outbid_events e ON e.bid_id=p.bid_id
      JOIN auctions a ON a.id=e.auction_id JOIN users u ON u.id=e.user_id
      JOIN dealer_push_devices d ON d.token_hash=p.token_hash AND d.user_id=e.user_id
      SET p.state='processing',p.attempts=p.attempts+1,p.lease_until=UTC_TIMESTAMP(3)+INTERVAL 2 MINUTE
      WHERE p.bid_id=? AND p.token_hash=? AND (p.state='pending' OR (p.state='processing' AND p.lease_until<UTC_TIMESTAMP(3)))
      AND a.status='open' AND a.ends_at>UTC_TIMESTAMP(3) AND a.highest_bidder_id<>e.user_id
      AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')`,key);
    if(!claim.affectedRows)continue;
    try{
      const ttl=Math.floor(Number(row.ttl_seconds)-(Date.now()-selectedAt)/1000);
      if(ttl<=0){await pool.query("UPDATE dealer_outbid_deliveries SET state='skipped',lease_until=NULL WHERE bid_id=? AND token_hash=?",key);continue;}
      await sender.send(row.fcm_token,{type:'outbid',auctionId:String(row.auction_id),title:'You have been outbid',body:`${String(row.brand||'').slice(0,60)} ${String(row.model||'').slice(0,80)} · Lot #${row.auction_id}. Another dealer placed a higher bid. Tap to view and bid again.`},ttl);
      await pool.query("UPDATE dealer_outbid_deliveries SET state='sent',lease_until=NULL,last_error=NULL WHERE bid_id=? AND token_hash=?",key);
    }catch(error){
      const code=String(error.code||'DELIVERY_ERROR').slice(0,100),attempts=Number(row.attempts)+1;
      if(error.invalidToken)await pool.query('DELETE FROM dealer_push_devices WHERE token_hash=? AND user_id=?',[row.token_hash,row.user_id]);
      await pool.query('UPDATE dealer_outbid_deliveries SET state=?,lease_until=NULL,last_error=?,available_at=UTC_TIMESTAMP(3)+INTERVAL ? SECOND WHERE bid_id=? AND token_hash=?',[error.invalidToken?'skipped':attempts>=8?'failed':'pending',code,Math.min(900,15*2**Math.min(attempts,6)),...key]);
      log.error('Outbid push failed:',code);
    }
  }
}
module.exports={ensureOutbidNotifications,queueOutbid,deliverOutbids};
