const {fail,money} = require('./auctionRules');
function auctionFilters(viewer, filters={}) {
  const clauses=[],params=[];
  const phase=filters.phase||'all';
  const phases={live:"a.status='open' AND a.starts_at<=UTC_TIMESTAMP(3) AND a.ends_at>UTC_TIMESTAMP(3)",upcoming:"a.status='open' AND a.starts_at>UTC_TIMESTAMP(3)",ended:"a.status IN ('closed','cancelled')",mybids:'EXISTS (SELECT 1 FROM auction_bids mine WHERE mine.auction_id=a.id AND mine.bidder_id=?)',wins:"a.status='closed' AND a.result='sold' AND a.winner_id=?"};
  if(phase!=='all') {if(typeof phase!=='string'||!Object.hasOwn(phases,phase))fail('Invalid auction filter');clauses.push(phases[phase]);if(['mybids','wins'].includes(phase))params.push(viewer.id);}
  for(const [key,max] of [['search',100],['brand',100]])if(filters[key]) {
    if(typeof filters[key]!=='string'||filters[key].length>max)fail('Search is too long');
    if(key==='search'){clauses.push('(b.brand LIKE ? OR b.model LIKE ? OR b.registration_number LIKE ?)');const term='%'+filters[key].trim()+'%';params.push(term,term,term);}
    else {clauses.push('b.brand LIKE ?');params.push('%'+filters[key].trim()+'%');}
  }
  if(filters.maxPrice){clauses.push('COALESCE(a.highest_bid,a.starting_price)<=?');params.push(money(filters.maxPrice,'Maximum price'));}
  return {where:clauses.length?' WHERE '+clauses.map(c=>'('+c+')').join(' AND '):'',params};
}
module.exports={auctionFilters};
