const crypto = require('node:crypto');
const {ensureOutbidNotifications,deliverOutbids}=require('./outbidNotifications');
const {ensureApprovalNotifications,deliverApprovals}=require('./registrationNotifications');
const {createFirebaseSender} = require('./firebasePush');
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
function validToken(token) { return typeof token === 'string' && /^[A-Za-z0-9:_-]{20,4096}$/.test(token); }
function alertData(row) {
  return {auctionId:String(row.auction_id),title:'Auction is live',body:`${String(row.brand || '').slice(0,60)} ${String(row.model || '').slice(0,80)} · Lot #${row.auction_id}. Tap to view and bid.`};
}
function createNotificationWorker(pool, {sender = createFirebaseSender(), log = console} = {}) {
  let ensuring, running;
  function ensure() {
    if (!ensuring) ensuring = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS dealer_push_devices (
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL, fcm_token VARCHAR(4096) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        updated_at DATETIME(3) NOT NULL, KEY push_user (user_id)
      ) ENGINE=InnoDB`);
      await pool.query(`CREATE TABLE IF NOT EXISTS auction_push_deliveries (
        auction_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        state ENUM('pending','processing','sent','skipped','failed') NOT NULL DEFAULT 'pending',
        attempts INT UNSIGNED NOT NULL DEFAULT 0, available_at DATETIME(3) NOT NULL,
        lease_until DATETIME(3) NULL, sent_at DATETIME(3) NULL, last_error VARCHAR(100) NULL,
        PRIMARY KEY (auction_id,token_hash), KEY push_ready (state,available_at)
      ) ENGINE=InnoDB`);
      await ensureApprovalNotifications(pool);
      await ensureOutbidNotifications(pool);
    })().catch(error => { ensuring = null; throw error; });
    return ensuring;
  }
  async function register(userId, token) {
    if (!validToken(token)) { const e = new Error('Invalid notification device token'); e.status = 400; e.expose = true; throw e; }
    await ensure();
    await pool.query(`INSERT INTO dealer_push_devices (token_hash,user_id,fcm_token,updated_at) VALUES (?,?,?,UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),fcm_token=VALUES(fcm_token),updated_at=VALUES(updated_at)`,[tokenHash(token),userId,token]);
  }
  async function unregister(userId, token) {
    if (!validToken(token)) return;
    await ensure();
    await pool.query('DELETE FROM dealer_push_devices WHERE token_hash=? AND user_id=?',[tokenHash(token),userId]);
  }
  async function sweep() {
    if (!sender.configured()) return;
    await ensure();
    await deliverOutbids(pool,sender,log);
    await deliverApprovals(pool,sender,log);
    // SQL uses the database UTC clock, matching auction bidding and closure.
    // One durable delivery per auction/device: repeated sweeps and re-auctions stay separate.
    await pool.query(`INSERT IGNORE INTO auction_push_deliveries (auction_id,token_hash,available_at)
      SELECT a.id,d.token_hash,UTC_TIMESTAMP(3) FROM auctions a
      JOIN dealer_push_devices d ON d.updated_at >= UTC_TIMESTAMP(3) - INTERVAL 90 DAY
      JOIN users u ON u.id=d.user_id AND u.role IN ('dealer','bidder') AND u.is_active=1 AND u.is_verified=1
      WHERE a.status='open' AND a.starts_at <= UTC_TIMESTAMP(3) AND a.ends_at > UTC_TIMESTAMP(3)`);
    await pool.query(`UPDATE auction_push_deliveries p LEFT JOIN auctions a ON a.id=p.auction_id
      LEFT JOIN dealer_push_devices d ON d.token_hash=p.token_hash LEFT JOIN users u ON u.id=d.user_id
      SET p.state='skipped',p.lease_until=NULL WHERE p.state IN ('pending','processing')
      AND (a.id IS NULL OR a.status<>'open' OR a.ends_at<=UTC_TIMESTAMP(3) OR d.token_hash IS NULL OR u.id IS NULL
      OR u.is_active<>1 OR u.is_verified<>1 OR u.role NOT IN ('dealer','bidder'))`);
    const [rows] = await pool.query(`SELECT p.auction_id,p.token_hash,p.attempts,d.fcm_token,b.brand,b.model,
      TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(3),a.ends_at) AS ttl_seconds
      FROM auction_push_deliveries p JOIN auctions a ON a.id=p.auction_id JOIN bikes b ON b.id=a.bike_id
      JOIN dealer_push_devices d ON d.token_hash=p.token_hash JOIN users u ON u.id=d.user_id
      WHERE (p.state='pending' OR (p.state='processing' AND p.lease_until<UTC_TIMESTAMP(3)))
      AND p.available_at<=UTC_TIMESTAMP(3) AND a.status='open' AND a.starts_at<=UTC_TIMESTAMP(3) AND a.ends_at>UTC_TIMESTAMP(3)
      AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder') ORDER BY p.available_at LIMIT 50`);
    const selectedAt=Date.now();
    for(const row of rows) row.selectedAt=selectedAt;
    for (let i=0;i<rows.length;i+=5) await Promise.all(rows.slice(i,i+5).map(deliver));
  }
  async function deliver(row) {
    const key = [row.auction_id,row.token_hash];
    const [claim] = await pool.query(`UPDATE auction_push_deliveries p JOIN auctions a ON a.id=p.auction_id
      JOIN dealer_push_devices d ON d.token_hash=p.token_hash JOIN users u ON u.id=d.user_id
      SET p.state='processing',p.attempts=p.attempts+1,p.lease_until=UTC_TIMESTAMP(3)+INTERVAL 2 MINUTE
      WHERE p.auction_id=? AND p.token_hash=? AND (p.state='pending' OR (p.state='processing' AND p.lease_until<UTC_TIMESTAMP(3)))
      AND a.status='open' AND a.starts_at<=UTC_TIMESTAMP(3) AND a.ends_at>UTC_TIMESTAMP(3)
      AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')`,key);
    if (!claim.affectedRows) return;
    try {
      const ttl=Math.floor(Number(row.ttl_seconds)-(Date.now()-row.selectedAt)/1000);
      if(ttl<=0){await pool.query("UPDATE auction_push_deliveries SET state='skipped',lease_until=NULL WHERE auction_id=? AND token_hash=?",key);return;}
      await sender.send(row.fcm_token,alertData(row),ttl);
      await pool.query("UPDATE auction_push_deliveries SET state='sent',sent_at=UTC_TIMESTAMP(3),lease_until=NULL,last_error=NULL WHERE auction_id=? AND token_hash=?",key);
    } catch (error) {
      const code = String(error.code || 'DELIVERY_ERROR').slice(0,100);
      if (error.invalidToken) {
        await pool.query('DELETE FROM dealer_push_devices WHERE token_hash=?',[row.token_hash]);
        await pool.query("UPDATE auction_push_deliveries SET state='skipped',lease_until=NULL,last_error=? WHERE auction_id=? AND token_hash=?",[code,...key]);
      } else {
        const attempts = Number(row.attempts)+1;
        await pool.query(`UPDATE auction_push_deliveries SET state=?,lease_until=NULL,last_error=?,available_at=UTC_TIMESTAMP(3)+INTERVAL ? SECOND
          WHERE auction_id=? AND token_hash=?`,[attempts>=8?'failed':'pending',code,Math.min(900,15*2**Math.min(attempts,6)),...key]);
        log.error('Auction push delivery failed:',code);
      }
    }
  }
  function run() {
    if (!running) running = sweep().finally(() => { running = null; });
    return running;
  }
  function start() {
    if (!sender.configured()) { log.info('Auction push disabled: Firebase server credentials not configured.'); return; }
    const tick=()=>run().catch(error=>log.error('Auction notification sweep failed:',error.code || 'PUSH_CONFIGURATION_OR_DATABASE_ERROR'));
    tick(); const timer=setInterval(tick,5000);timer.unref(); return timer;
  }
  return {ensure,register,unregister,run,start,configured:sender.configured};
}
let singleton;
function worker() { return singleton ||= createNotificationWorker(require('../config/db')); }
module.exports={createNotificationWorker,validToken,tokenHash,alertData,worker};
