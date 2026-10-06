const MAX_PRICE = 1000000000;
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Invalid ID');
  return Number(value);
}
function money(value, name = 'Bid') {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > MAX_PRICE) fail(`${name} must be whole rupees between 1 and ${MAX_PRICE}`);
  return Number(value);
}
function date(value) {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail('Dates must include a timezone');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail('Invalid date');
  return parsed;
}
function creation(body, now) {
  const bikeId = positiveId(body.bikeId);
  const startingPrice = money(body.startingPrice, 'Starting price');
  const minIncrement = money(body.minIncrement, 'Minimum increase');
  const reservePrice = body.reservePrice == null || body.reservePrice === '' ? startingPrice : money(body.reservePrice, 'Reserve price');
  if (reservePrice < startingPrice) fail('Reserve price cannot be below the starting price');
  const startsAt = date(body.startsAt), endsAt = date(body.endsAt);
  if (startsAt.getTime() < now - 60000) fail('Start time is in the past');
  if (endsAt <= startsAt || endsAt.getTime() <= now || endsAt - startsAt > 30 * 86400000) fail('End time must follow start time, within 30 days');
  return {bikeId, startingPrice, minIncrement, reservePrice, startsAt, endsAt};
}
function minimum(auction) { return auction.highest_bid == null ? Number(auction.starting_price) : Number(auction.highest_bid) + Number(auction.min_increment); }
function eligible(user, roles) {
  if (!user || !user.is_active || !user.is_verified || !roles.includes(user.role)) fail('An approved, active account is required', 403);
}
function checkBid(auction, amount, now) {
  if (auction.status !== 'open' || now >= new Date(auction.ends_at).getTime()) fail('Auction has ended', 409);
  if (now < new Date(auction.starts_at).getTime()) fail('Auction has not started', 409);
  if (amount < minimum(auction)) fail(`Minimum bid is ₹${minimum(auction)}`, 409);
}
function outcome(auction) { return auction.highest_bid != null && Number(auction.highest_bid) >= Number(auction.reserve_price) ? 'sold' : 'unsold'; }
module.exports = {fail, positiveId, money, creation, minimum, eligible, checkBid, outcome};
