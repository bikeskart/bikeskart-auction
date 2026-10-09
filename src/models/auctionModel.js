const {ensureBikeProfile,readProfile}=require("../utils/bikeProfile");
const rules = require('../utils/auctionRules');
const {ensureOutbidNotifications,queueOutbid}=require('../utils/outbidNotifications');
const {auctionFilters} = require('../utils/auctionFilters');
const isoSQL = value => new Date(value).toISOString().slice(0,23).replace('T',' ');
const iso = value => value == null ? null : new Date(typeof value === 'string' && !value.includes('T') ? value.replace(' ','T')+'Z' : value).toISOString();
const selectAuction = `SELECT a.*, DATE_FORMAT(starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS starts_at,
  DATE_FORMAT(ends_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS ends_at FROM auctions a`;

function createAuctionModel(pool) {
  async function transaction(action) {
    const c = await pool.getConnection();
    try {
      await c.query("SET time_zone = '+00:00'");
      await c.beginTransaction();
      const result = await action(c);
      await c.commit();
      return result;
    } catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  }
  async function clock(c) {
    const [[row]] = await c.query('SELECT UNIX_TIMESTAMP(UTC_TIMESTAMP(3)) * 1000 AS now_ms');
    return Number(row.now_ms);
  }
  async function user(c, id, roles) {
    const [[u]] = await c.query('SELECT id, role, is_active, is_verified FROM users WHERE id = ? FOR UPDATE',[id]);
    rules.eligible(u, roles);
    return u;
  }
  async function locked(c, id) {
    const [[a]] = await c.query(`${selectAuction} WHERE a.id = ? FOR UPDATE`,[id]);
    if (!a) rules.fail('Auction not found',404);
    return a;
  }
  async function settle(c, a, now) {
    if (a.status !== 'open' || new Date(a.ends_at).getTime() > now) return a;
    a.result = rules.outcome(a);
    a.winner_id = a.result === 'sold' ? a.highest_bidder_id : null;
    a.status = 'closed';
    await c.query("UPDATE auctions SET status = 'closed', result = ?, winner_id = ?, closed_at = UTC_TIMESTAMP(3) WHERE id = ?",[a.result,a.winner_id,a.id]);
    return a;
  }
  async function create(body, adminId, checkReadiness) {
    return transaction(async c => {
      await user(c,adminId,['admin']);
      const input = rules.creation(body,await clock(c));
      const [[bike]] = await c.query('SELECT id, status FROM bikes WHERE id = ? FOR UPDATE',[input.bikeId]);
      if (!bike) rules.fail('Bike not found',404);
      if (checkReadiness) await checkReadiness(c,input.bikeId);
      if (bike.status === 'sold') rules.fail('A sold bike cannot be auctioned',409);
      const [[active]] = await c.query("SELECT id FROM auctions WHERE bike_id = ? AND status = 'open'",[input.bikeId]);
      if (active) rules.fail('This bike already has an active auction',409);
      const [[sold]] = await c.query("SELECT id FROM auctions WHERE bike_id = ? AND result = 'sold' LIMIT 1",[input.bikeId]);
      if (sold) rules.fail('This bike already has a winning auction',409);
      const [result] = await c.query(`INSERT INTO auctions
        (bike_id,created_by,starting_price,min_increment,reserve_price,starts_at,ends_at,created_at)
        VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,[input.bikeId,adminId,input.startingPrice,input.minIncrement,input.reservePrice,isoSQL(input.startsAt),isoSQL(input.endsAt)]);
      return {id:result.insertId};
    });
  }
  async function bid(id, bidderId, body) {
    const amount = rules.money(body.amount);
    const requestId = String(body.requestId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) rules.fail('A valid bid request ID is required');
    await ensureOutbidNotifications(pool);
    const result = await transaction(async c => {
      const a = await locked(c,id);
      await user(c,bidderId,['dealer','bidder']);
      const [[existing]] = await c.query('SELECT id, auction_id, amount FROM auction_bids WHERE bidder_id = ? AND request_id = ?',[bidderId,requestId]);
      if (existing) {
        if (Number(existing.auction_id) !== id || Number(existing.amount) !== amount) rules.fail('Bid request ID already used for a different bid',409);
        return {bidId:existing.id,amount,replayed:true};
      }
      const now = await clock(c); // Clock is read AFTER acquiring locks, never from the browser.
      if (a.status === 'open' && now >= new Date(a.ends_at).getTime()) {
        await settle(c,a,now);
        return {ended:true}; // Commit closing even though this late bid is rejected.
      }
      rules.checkBid(a,amount,now);
      const [insert] = await c.query('INSERT INTO auction_bids (auction_id,bidder_id,amount,request_id,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP(3))',[id,bidderId,amount,requestId]);
      await queueOutbid(c,a,insert.insertId,bidderId);
      await c.query('UPDATE auctions SET highest_bid = ?, highest_bidder_id = ?, bid_count = bid_count + 1 WHERE id = ?',[amount,bidderId,id]);
      return {bidId:insert.insertId,amount,replayed:false};
    });
    if (result.ended) rules.fail('Auction has ended',409);
    return result;
  }
  async function cancel(id,adminId) {
    return transaction(async c => {
      const a = await locked(c,id);
      await user(c,adminId,['admin']);
      const now = await clock(c);
      if (a.status !== 'open' || now >= new Date(a.ends_at).getTime()) rules.fail('Auction is already ended',409);
      if (Number(a.bid_count) > 0) rules.fail('An auction with bids cannot be cancelled',409);
      await c.query("UPDATE auctions SET status = 'cancelled', closed_at = UTC_TIMESTAMP(3) WHERE id = ?",[id]);
      return {cancelled:true};
    });
  }
  async function close(id) { return transaction(async c => settle(c,await locked(c,id),await clock(c))); }
  let closing = null;
  function closeDue() {
    if (closing) return closing;
    closing = (async () => {
      const [rows] = await pool.query("SELECT id FROM auctions WHERE status = 'open' AND ends_at <= UTC_TIMESTAMP(3) ORDER BY ends_at LIMIT 100");
      for (const row of rows) await close(row.id);
    })().finally(() => { closing = null; });
    return closing;
  }
  function publicAuction(row, now, viewer) {
    const a = {...row,starts_at:iso(row.starts_at),ends_at:iso(row.ends_at)};
    a.phase = a.status === 'cancelled' ? 'cancelled' : a.status === 'closed' || now >= new Date(a.ends_at).getTime() ? 'ended' : now < new Date(a.starts_at).getTime() ? 'upcoming' : 'live';
    a.minimum_bid = rules.minimum(a);
    a.is_leading = Boolean(viewer && String(a.highest_bidder_id) === String(viewer.id));
    a.is_winner = Boolean(viewer && String(a.winner_id) === String(viewer.id));
    if (viewer?.role !== 'admin') for (const key of ['reserve_price','highest_bidder_id','winner_id','created_by','active_bike_id','winner_name','winner_email','leading_name','leading_business']) delete a[key];
    return a;
  }
  async function list(viewer, page=1, filters={}) {
    const filter=auctionFilters(viewer,filters);
    await closeDue();
    const [[time]] = await pool.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS server_now");
    const [rows] = await pool.query(`SELECT a.*, DATE_FORMAT(a.starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS starts_at,
      DATE_FORMAT(a.ends_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS ends_at,
      b.brand,b.model,b.registration_number,b.year,b.kilometers_driven,b.condition_notes,b.ownership_count,b.fuel_type,
      (SELECT image_url FROM bike_images WHERE bike_id = b.id ORDER BY sort_order,id LIMIT 1) AS cover_image,
      (SELECT MAX(amount) FROM auction_bids mine WHERE mine.auction_id=a.id AND mine.bidder_id=?) AS my_bid,
      u.full_name AS winner_name,u.email AS winner_email,leader.full_name AS leading_name
      FROM auctions a JOIN bikes b ON b.id = a.bike_id LEFT JOIN users u ON u.id = a.winner_id LEFT JOIN users leader ON leader.id=a.highest_bidder_id
      ${filter.where} ORDER BY (a.status = 'open') DESC,a.created_at DESC,a.id DESC LIMIT 50 OFFSET ?`,[viewer.id,...filter.params,(page-1)*50]);
    const bikeIds=[...new Set(rows.map(row=>row.bike_id))];
    const images=bikeIds.length?(await pool.query(`SELECT bike_id,image_url FROM bike_images WHERE bike_id IN (${bikeIds.map(()=>'?').join(',')}) ORDER BY sort_order,id`,bikeIds))[0]:[];
    for(const row of rows) row.images=images.filter(image=>String(image.bike_id)===String(row.bike_id)&&image.image_url).map(image=>({image_url:image.image_url}));
    const [[{total}]] = await pool.query(`SELECT COUNT(*) AS total FROM auctions a JOIN bikes b ON b.id=a.bike_id ${filter.where}`,filter.params);
    return {rows:rows.map(r => publicAuction(r,new Date(time.server_now).getTime(),viewer)),serverNow:time.server_now,page,total};
  }
  async function detail(id,viewer) {
    await close(id);
    const [[time]] = await pool.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS server_now");
    const [[a]] = await pool.query(`${selectAuction} WHERE a.id = ?`,[id]);
    await ensureBikeProfile(pool);
    const [[bike]] = await pool.query('SELECT id,brand,model,registration_number,year,kilometers_driven,ownership_count,fuel_type,condition_notes,detail_profile FROM bikes WHERE id = ?',[a.bike_id]);
    const [images] = await pool.query('SELECT image_url FROM bike_images WHERE bike_id = ? ORDER BY sort_order,id',[a.bike_id]);
    const [bids] = await pool.query('SELECT amount, DATE_FORMAT(created_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS created_at FROM auction_bids WHERE auction_id = ? ORDER BY id DESC LIMIT 20',[id]);
    return {auction:publicAuction(a,new Date(time.server_now).getTime(),viewer),bike:{...bike,detail_profile:readProfile(bike.detail_profile),images},bids,serverNow:time.server_now};
  }
  return {create,bid,cancel,closeDue,list,detail};
}
module.exports = createAuctionModel(require('../config/db'));
module.exports.createAuctionModel = createAuctionModel;
