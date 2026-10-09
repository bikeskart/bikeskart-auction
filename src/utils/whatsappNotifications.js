const {createWhatsAppSender}=require('./whatsappCloud');
const {auctionEvents,saleEvents}=require('./whatsappEvents');
const {whatsAppPhone}=require('./winnerMessages');
const {applyReceipt}=require('./whatsappReceipts');
const auctionSelect=`SELECT a.id AS auction_id,a.status,a.result,a.winner_id,a.highest_bid,a.starts_at,a.ends_at,a.created_at,
  b.brand,b.model,b.registration_number,b.sale_profile,b.updated_at AS bike_updated_at,c.confirmed_at`;
function createWhatsAppWorker(pool,{sender=createWhatsAppSender({uploadRoot:require('../middleware/upload').uploadRoot}),log=console}={}){
  let ensuring,running,auctionCursor=0,saleCursor=0;
  function ensure(){
    if(!ensuring)ensuring=(async()=>{
      await pool.query(`CREATE TABLE IF NOT EXISTS dealer_whatsapp_preferences (
        user_id BIGINT UNSIGNED PRIMARY KEY,phone VARCHAR(20) NOT NULL,
        transactions_enabled TINYINT(1) NOT NULL DEFAULT 0,auctions_enabled TINYINT(1) NOT NULL DEFAULT 0,
        transaction_opted_at DATETIME(3) NULL,auction_opted_at DATETIME(3) NULL,
        updated_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB`);
      await pool.query(`CREATE TABLE IF NOT EXISTS dealer_whatsapp_outbox (
        event_key VARCHAR(190) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        kind VARCHAR(30) NOT NULL,auction_id BIGINT UNSIGNED NOT NULL,user_id BIGINT UNSIGNED NOT NULL,
        recipient VARCHAR(20) NOT NULL,state VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT UNSIGNED NOT NULL DEFAULT 0,available_at DATETIME(3) NOT NULL,
        lease_until DATETIME(3) NULL,expires_at DATETIME(3) NOT NULL,
        message_id VARCHAR(190) NULL,last_error VARCHAR(100) NULL,
        created_at DATETIME(3) NOT NULL,updated_at DATETIME(3) NOT NULL,
        KEY whatsapp_ready (state,available_at),KEY whatsapp_message (message_id)
      ) ENGINE=InnoDB`);
      await pool.query(`CREATE TABLE IF NOT EXISTS dealer_whatsapp_receipts (
        message_id VARCHAR(190) PRIMARY KEY,state VARCHAR(20) NOT NULL,status_rank INT NOT NULL,
        last_error VARCHAR(100) NULL,updated_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB`);
      // Reuse existing schema helpers, preserving production schema ownership.
      await require('./bikeSale').ensureSale(pool);
      await require('./adminOperations').ensureOperations(pool);
    })().catch(error=>{ensuring=null;throw error;});
    return ensuring;
  }
  async function preferences(id){
    await ensure();const [[p]]=await pool.query('SELECT transactions_enabled,auctions_enabled FROM dealer_whatsapp_preferences WHERE user_id=?',[id]);
    return {transactions:Boolean(p?.transactions_enabled),auctions:Boolean(p?.auctions_enabled)};
  }
  async function savePreferences(user,body){
    if(typeof body.transactions!=='boolean'||typeof body.auctions!=='boolean')throw Object.assign(new Error('Choose your WhatsApp notification preferences'),{status:400,expose:true});
    const phone=whatsAppPhone(user.phone);if(!phone)throw Object.assign(new Error('Your dealer profile needs a valid WhatsApp mobile number'),{status:400,expose:true});
    await ensure();
    // Preserve original opt-in dates on ordinary saves; resetting is deliberate
    // when consent is enabled again or the registered phone number changes.
    await pool.query(`INSERT INTO dealer_whatsapp_preferences
      (user_id,phone,transactions_enabled,auctions_enabled,transaction_opted_at,auction_opted_at,updated_at)
      VALUES (?,?,?,?,IF(?,UTC_TIMESTAMP(3),NULL),IF(?,UTC_TIMESTAMP(3),NULL),UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
      transaction_opted_at=IF(VALUES(transactions_enabled)=1 AND (transactions_enabled=0 OR phone<>VALUES(phone)),UTC_TIMESTAMP(3),transaction_opted_at),
      auction_opted_at=IF(VALUES(auctions_enabled)=1 AND (auctions_enabled=0 OR phone<>VALUES(phone)),UTC_TIMESTAMP(3),auction_opted_at),
      phone=VALUES(phone),transactions_enabled=VALUES(transactions_enabled),auctions_enabled=VALUES(auctions_enabled),updated_at=UTC_TIMESTAMP(3)`,[user.id,phone,Number(body.transactions),Number(body.auctions),body.transactions,body.auctions]);
    return body;
  }
  async function enqueue(event){
    const days=['new_auction','auction_live'].includes(event.kind)?1:7;
    await pool.query(`INSERT IGNORE INTO dealer_whatsapp_outbox (event_key,kind,auction_id,user_id,recipient,available_at,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)+INTERVAL ? DAY,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[event.event_key,event.kind,event.auction_id,event.user_id,event.recipient,days]);
  }
  async function discover(){
    // Keyset pages avoid starving older records as the catalog grows. Recipient
    // pages are fetched separately to avoid truncating a dealer broadcast.
    const [auctions]=await pool.query(`SELECT a.id FROM auctions a WHERE a.id>? AND a.status='open' AND a.ends_at>UTC_TIMESTAMP(3) ORDER BY a.id LIMIT 50`,[auctionCursor]);
    for(const auction of auctions){
      let dealerCursor=0,more;
      do{
        const [rows]=await pool.query(`${auctionSelect},p.user_id,p.phone AS consent_phone,p.auctions_enabled,p.auction_opted_at,u.phone
          FROM auctions a JOIN bikes b ON b.id=a.bike_id LEFT JOIN auction_confirmations c ON c.auction_id=a.id
          JOIN dealer_whatsapp_preferences p ON p.auctions_enabled=1 JOIN users u ON u.id=p.user_id
          WHERE a.id=? AND p.user_id>? AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')
          ORDER BY p.user_id LIMIT 100`,[auction.id,dealerCursor]);
        for(const row of rows)for(const event of auctionEvents(row))await enqueue(event);
        more=rows.length===100;if(rows.length)dealerCursor=rows.at(-1).user_id;
      }while(more);
    }
    auctionCursor=auctions.length===50?auctions.at(-1).id:0;
    const [sales]=await pool.query(`${auctionSelect},p.user_id,p.phone AS consent_phone,p.transactions_enabled,p.transaction_opted_at,u.phone,u.full_name
      FROM auctions a JOIN bikes b ON b.id=a.bike_id JOIN auction_confirmations c ON c.auction_id=a.id
      JOIN users u ON u.id=a.winner_id JOIN dealer_whatsapp_preferences p ON p.user_id=u.id AND p.transactions_enabled=1
      WHERE a.id>? AND a.status='closed' AND a.result='sold' AND u.is_active=1 AND u.is_verified=1 AND u.role IN ('dealer','bidder')
      ORDER BY a.id LIMIT 100`,[saleCursor]);
    for(const row of sales)for(const event of saleEvents(row))await enqueue(event);
    saleCursor=sales.length===100?sales.at(-1).auction_id:0;
  }
  async function current(outbox){
    const [[row]]=await pool.query(`${auctionSelect},p.user_id,p.phone AS consent_phone,p.transactions_enabled,p.auctions_enabled,
      p.transaction_opted_at,p.auction_opted_at,u.phone,u.full_name,u.is_active,u.is_verified,u.role
      FROM auctions a JOIN bikes b ON b.id=a.bike_id LEFT JOIN auction_confirmations c ON c.auction_id=a.id
      JOIN users u ON u.id=? JOIN dealer_whatsapp_preferences p ON p.user_id=u.id
      WHERE a.id=?`,[outbox.user_id,outbox.auction_id]);
    if(!row||!row.is_active||!row.is_verified||!['dealer','bidder'].includes(row.role))return null;
    return [...auctionEvents(row),...saleEvents(row)].find(e=>e.event_key===outbox.event_key&&e.recipient===outbox.recipient)||null;
  }
  async function deliver(row){
    const [claim]=await pool.query(`UPDATE dealer_whatsapp_outbox SET state='processing',attempts=attempts+1,lease_until=UTC_TIMESTAMP(3)+INTERVAL 2 MINUTE,updated_at=UTC_TIMESTAMP(3)
      WHERE event_key=? AND state='pending' AND expires_at>UTC_TIMESTAMP(3)`,[row.event_key]);
    if(!claim.affectedRows)return;
    let sending=false,accepted=false;
    try{
      const event=await current(row);
      if(!event){await pool.query("UPDATE dealer_whatsapp_outbox SET state='skipped',lease_until=NULL,updated_at=UTC_TIMESTAMP(3) WHERE event_key=?",[row.event_key]);return;}
      sending=true;
      const messageId=await sender.send(event);accepted=true;
      await pool.query("UPDATE dealer_whatsapp_outbox SET state='accepted',message_id=?,lease_until=NULL,last_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE event_key=?",[messageId,row.event_key]);
      await applyReceipt(pool,messageId);
    }catch(error){
      const attempts=Number(row.attempts)+1,state=accepted||error.uncertain?'uncertain':(!sending||error.retryable)&&attempts<6?'pending':'failed';
      await pool.query('UPDATE dealer_whatsapp_outbox SET state=?,lease_until=NULL,last_error=?,available_at=UTC_TIMESTAMP(3)+INTERVAL ? SECOND,updated_at=UTC_TIMESTAMP(3) WHERE event_key=?',[state,String(error.code||'WHATSAPP_ERROR').slice(0,100),Math.min(900,30*2**Math.min(attempts,5)),row.event_key]);
      log.error('WhatsApp message failed:',error.code||'WHATSAPP_ERROR');
    }
  }
  async function sweep(){
    if(!sender.configured())return;await ensure();await discover();
    // A crash/timeout after sending is ambiguous. Do not automatically send the
    // same WhatsApp message again and risk duplicate invoices or winner notices.
    await pool.query("UPDATE dealer_whatsapp_outbox SET state='uncertain',last_error='PROCESS_INTERRUPTED',lease_until=NULL WHERE state='processing' AND lease_until<UTC_TIMESTAMP(3)");
    await pool.query("UPDATE dealer_whatsapp_outbox SET state='skipped' WHERE state='pending' AND expires_at<=UTC_TIMESTAMP(3)");
    const [rows]=await pool.query("SELECT event_key,kind,auction_id,user_id,recipient,attempts FROM dealer_whatsapp_outbox WHERE state='pending' AND available_at<=UTC_TIMESTAMP(3) AND expires_at>UTC_TIMESTAMP(3) ORDER BY available_at LIMIT 30");
    for(const row of rows)await deliver(row);
  }
  function run(){if(!running)running=sweep().finally(()=>{running=null;});return running;}
  function start(){if(!sender.configured()){log.info('WhatsApp notifications disabled: complete Cloud API settings first.');return;}const tick=()=>run().catch(e=>log.error('WhatsApp worker failed:',e.code||'DATABASE_ERROR'));tick();const timer=setInterval(tick,10000);timer.unref();return timer;}
  return {ensure,preferences,savePreferences,run,start,configured:sender.configured,current,deliver};
}
let singleton;
function worker(){return singleton ||=createWhatsAppWorker(require('../config/db'));}
module.exports={createWhatsAppWorker,worker};
