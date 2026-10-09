// Approval events are committed with the account change. Delivery is retried by
// the existing push worker, including after a server restart.
async function ensureApprovalNotifications(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS dealer_approval_events (
    user_id BIGINT UNSIGNED PRIMARY KEY, created_at DATETIME(3) NOT NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dealer_approval_deliveries (
    user_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state ENUM('pending','processing','sent','skipped','failed') NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0, available_at DATETIME(3) NOT NULL,
    lease_until DATETIME(3) NULL, sent_at DATETIME(3) NULL, last_error VARCHAR(100) NULL,
    PRIMARY KEY (user_id,token_hash), KEY approval_ready (state,available_at)
  ) ENGINE=InnoDB`);
}
async function queueApproval(connection, id) {
  await connection.query('INSERT IGNORE INTO dealer_approval_events (user_id,created_at) VALUES (?,UTC_TIMESTAMP(3))',[id]);
}
async function deliverApprovals(pool, sender, log) {
  await pool.query(`INSERT IGNORE INTO dealer_approval_deliveries (user_id,token_hash,available_at)
    SELECT e.user_id,d.token_hash,UTC_TIMESTAMP(3) FROM dealer_approval_events e
    JOIN dealer_push_devices d ON d.user_id=e.user_id
    JOIN users u ON u.id=e.user_id AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')
    WHERE e.created_at>UTC_TIMESTAMP(3)-INTERVAL 7 DAY`);
  const [rows]=await pool.query(`SELECT p.user_id,p.token_hash,p.attempts,d.fcm_token FROM dealer_approval_deliveries p
    JOIN dealer_approval_events e ON e.user_id=p.user_id
    JOIN dealer_push_devices d ON d.user_id=p.user_id AND d.token_hash=p.token_hash
    JOIN users u ON u.id=p.user_id
    WHERE (p.state='pending' OR (p.state='processing' AND p.lease_until<UTC_TIMESTAMP(3)))
    AND p.available_at<=UTC_TIMESTAMP(3) AND e.created_at>UTC_TIMESTAMP(3)-INTERVAL 7 DAY
    AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder') LIMIT 50`);
  for (const row of rows) {
    const key=[row.user_id,row.token_hash];
    const [claim]=await pool.query(`UPDATE dealer_approval_deliveries p
      JOIN dealer_push_devices d ON d.user_id=p.user_id AND d.token_hash=p.token_hash
      JOIN users u ON u.id=p.user_id
      SET p.state='processing',p.attempts=p.attempts+1,p.lease_until=UTC_TIMESTAMP(3)+INTERVAL 2 MINUTE
      WHERE p.user_id=? AND p.token_hash=? AND (p.state='pending' OR (p.state='processing' AND p.lease_until<UTC_TIMESTAMP(3)))
      AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')`,key);
    if (!claim.affectedRows) continue;
    try {
      await sender.send(row.fcm_token,{type:'registration_approved',title:'Registration approved',body:'Your BikesKart dealer registration has been approved. You can now log in and participate in auctions.'},86400);
      await pool.query("UPDATE dealer_approval_deliveries SET state='sent',sent_at=UTC_TIMESTAMP(3),lease_until=NULL,last_error=NULL WHERE user_id=? AND token_hash=?",key);
    } catch (error) {
      const code=String(error.code||'DELIVERY_ERROR').slice(0,100),attempts=Number(row.attempts)+1;
      if(error.invalidToken) await pool.query('DELETE FROM dealer_push_devices WHERE token_hash=? AND user_id=?',[row.token_hash,row.user_id]);
      await pool.query(`UPDATE dealer_approval_deliveries SET state=?,lease_until=NULL,last_error=?,available_at=UTC_TIMESTAMP(3)+INTERVAL ? SECOND WHERE user_id=? AND token_hash=?`,[error.invalidToken?'skipped':attempts>=8?'failed':'pending',code,Math.min(900,15*2**Math.min(attempts,6)),...key]);
      log.error('Registration approval push failed:',code);
    }
  }
}
module.exports={ensureApprovalNotifications,queueApproval,deliverApprovals};
