const {test} = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/utils/auctionRules');
const dbPath=require.resolve('../src/config/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createAuctionModel}=require('../src/models/auctionModel');
const NOW=Date.parse('2026-10-06T06:00:00Z');
const request=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(overrides={}) {
  const state={auction:{id:1,bike_id:2,status:'open',starting_price:50000,min_increment:500,reserve_price:50000,highest_bid:null,highest_bidder_id:null,winner_id:null,bid_count:0,starts_at:new Date(NOW-1000).toISOString(),ends_at:new Date(NOW+60000).toISOString(),...overrides},bids:[],now:NOW,accounts:{3:{id:3,role:'dealer',is_active:1,is_verified:1},4:{id:4,role:'bidder',is_active:1,is_verified:1},9:{id:9,role:'admin',is_active:1,is_verified:1}},commits:0};
  let queue=Promise.resolve();
  async function acquire(){const before=queue;let release;queue=new Promise(resolve=>release=resolve);await before;return release;}
  const pool={async getConnection(){let release,snapshot;return {
    async beginTransaction(){release=await acquire();snapshot=structuredClone(state);},
    async commit(){state.commits++;},async rollback(){if(snapshot)Object.assign(state,snapshot);},release(){release?.();},
    async query(sql,params=[]) {
      if(sql.startsWith('SET time_zone'))return [[]];
      if(sql.includes('AS now_ms'))return [[{now_ms:state.now}]];
      if(sql.includes('FROM auctions a')&&sql.includes('FOR UPDATE'))return [[structuredClone(state.auction)]];
      if(sql.includes('FROM users'))return [[structuredClone(state.accounts[params[0]])]];
      if(sql.startsWith('SELECT id, auction_id, amount FROM auction_bids'))return [[...state.bids.filter(b=>b.bidder_id===params[0]&&b.request_id===params[1])]];
      if(sql.startsWith('INSERT INTO auction_bids')){const id=state.bids.length+1;state.bids.push({id,auction_id:params[0],bidder_id:params[1],amount:params[2],request_id:params[3]});return [{insertId:id}];}
      if(sql.startsWith('UPDATE auctions SET highest_bid')){Object.assign(state.auction,{highest_bid:params[0],highest_bidder_id:params[1],bid_count:state.auction.bid_count+1});return [{affectedRows:1}];}
      if(sql.includes("SET status = 'closed'")){Object.assign(state.auction,{status:'closed',result:params[0],winner_id:params[1]});return [{affectedRows:1}];}
      if(sql.includes("SET status = 'cancelled'")){state.auction.status='cancelled';return [{affectedRows:1}];}
      if(sql.startsWith('SELECT id, status FROM bikes'))return [[{id:2,status:'ready'}]];
      if(sql.includes("AND status = 'open'"))return [[state.auction.status==='open'?{id:1}:undefined].filter(Boolean)];
      if(sql.includes("result = 'sold'"))return [[state.auction.result==='sold'?{id:1}:undefined].filter(Boolean)];
      if(sql.startsWith('INSERT INTO auctions'))return [{insertId:2}];
      throw Error('Unexpected SQL in test: '+sql);
    }
  };},async query(sql){if(sql.startsWith('SELECT id FROM auctions'))return [[state.auction.status==='open'&&new Date(state.auction.ends_at).getTime()<=state.now?{id:1}:undefined].filter(Boolean)];throw Error('Unexpected pool SQL');}};
  return {model:createAuctionModel(pool),state};
}
test('whole rupees, explicit timezones and auction duration are validated',()=>{
  for(const value of [0,-1,1.5,'1e3','',null,1000000001])assert.throws(()=>rules.money(value));
  assert.equal(rules.money('50000'),50000);
  const body={bikeId:2,startingPrice:50000,minIncrement:500,startsAt:new Date(NOW).toISOString(),endsAt:new Date(NOW+60000).toISOString()};
  assert.equal(rules.creation(body,NOW).reservePrice,50000);
  for(const change of [{reservePrice:49999},{endsAt:body.startsAt},{startsAt:'2026-10-06T06:00'},{endsAt:new Date(NOW+31*86400000).toISOString()}])assert.throws(()=>rules.creation({...body,...change},NOW));
});
test('first bid and minimum increments are enforced',async()=>{
  const {model,state}=fixture();await assert.rejects(model.bid(1,3,{amount:49999,requestId:request(1)}),/Minimum bid/);
  await model.bid(1,3,{amount:50000,requestId:request(2)});
  await assert.rejects(model.bid(1,4,{amount:50499,requestId:request(3)}),/Minimum bid/);
  assert.equal(state.bids.length,1);
  await model.bid(1,4,{amount:50500,requestId:request(4)});assert.equal(state.auction.highest_bidder_id,4);
});
test('simultaneous equal bids accept exactly one and keep consistent history',async()=>{
  const {model,state}=fixture();const results=await Promise.allSettled([model.bid(1,3,{amount:50000,requestId:request(1)}),model.bid(1,4,{amount:50000,requestId:request(2)})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(state.bids.length,1);assert.equal(state.auction.bid_count,1);assert.equal(state.auction.highest_bid,state.bids[0].amount);
});
test('retrying a bid request does not submit a second bid',async()=>{
  const {model,state}=fixture();const body={amount:50000,requestId:request(1)};
  await model.bid(1,3,body);assert.equal((await model.bid(1,3,body)).replayed,true);assert.equal(state.bids.length,1);
  await assert.rejects(model.bid(1,3,{...body,amount:51000}),/different bid/);
});
test('start and exact end boundaries use the locked database clock',async()=>{
  const {model,state}=fixture({starts_at:new Date(NOW+1000).toISOString()});await assert.rejects(model.bid(1,3,{amount:50000,requestId:request(1)}),/not started/);
  state.now+=1000;await model.bid(1,3,{amount:50000,requestId:request(1)});
  state.now=new Date(state.auction.ends_at).getTime();await assert.rejects(model.bid(1,4,{amount:50500,requestId:request(2)}),/ended/);
  assert.equal(state.auction.status,'closed');assert.equal(state.auction.winner_id,3);assert.equal(state.bids.length,1);
});
test('pending, disabled and admin accounts cannot bid',async()=>{
  for(const [id,change] of [[3,{is_verified:0}],[3,{is_active:0}],[9,{}]]){const {model,state}=fixture();Object.assign(state.accounts[id],change);await assert.rejects(model.bid(1,id,{amount:50000,requestId:request(1)}),/approved/);assert.equal(state.bids.length,0);}
});
test('reserve failure and no-bid auctions finish without a winner',async()=>{
  for(const withBid of [false,true]){const {model,state}=fixture({reserve_price:60000});if(withBid)await model.bid(1,3,{amount:50000,requestId:request(1)});state.now+=60000;await model.closeDue();assert.equal(state.auction.result,'unsold');assert.equal(state.auction.winner_id,null);}
});
test('closing is idempotent and highest bid wins at reserve',async()=>{
  const {model,state}=fixture({reserve_price:51000});await model.bid(1,3,{amount:50000,requestId:request(1)});await model.bid(1,4,{amount:51000,requestId:request(2)});state.now+=60000;await model.closeDue();await model.closeDue();assert.equal(state.auction.status,'closed');assert.equal(state.auction.winner_id,4);assert.equal(state.auction.result,'sold');
});
test('cancellation is admin-only and impossible after bids',async()=>{
  const {model,state}=fixture();await assert.rejects(model.cancel(1,3),/approved/);await model.bid(1,3,{amount:50000,requestId:request(1)});await assert.rejects(model.cancel(1,9),/with bids/);assert.equal(state.auction.status,'open');
  const fresh=fixture();await fresh.model.cancel(1,9);await assert.rejects(fresh.model.bid(1,3,{amount:50000,requestId:request(2)}),/ended/);
});
test('duplicate active auctions and a bike with a winner cannot be rescheduled',async()=>{
  const body={bikeId:2,startingPrice:50000,minIncrement:500,startsAt:new Date(NOW).toISOString(),endsAt:new Date(NOW+60000).toISOString()};
  await assert.rejects(fixture().model.create(body,9),/active auction/);
  await assert.rejects(fixture({status:'closed',result:'sold'}).model.create(body,9),/winning auction/);
  assert.equal((await fixture({status:'closed',result:'unsold'}).model.create(body,9)).id,2);
});
test('dealer auction responses hide reserve and other bidder identities',async()=>{
  const row={...fixture({status:'closed',result:'sold',highest_bid:55000,highest_bidder_id:3,winner_id:3}).state.auction,created_by:9,winner_name:'Private Name',winner_email:'private@example.com',active_bike_id:null};
  const pool={async query(sql){if(sql.startsWith('SELECT id FROM auctions'))return [[]];if(sql.includes(' AS server_now'))return [[{server_now:new Date(NOW).toISOString()}]];if(sql.includes('COUNT(*)'))return [[{total:1}]];return [[structuredClone(row)]];}};
  const model=createAuctionModel(pool),dealer=(await model.list({id:3,role:'dealer'})).rows[0];
  for(const key of ['reserve_price','highest_bidder_id','winner_id','created_by','winner_name','winner_email','active_bike_id'])assert.ok(!(key in dealer),key);
  assert.equal(dealer.is_winner,true);assert.equal(dealer.is_leading,true);
  const admin=(await model.list({id:9,role:'admin'})).rows[0];assert.equal(admin.reserve_price,50000);assert.equal(admin.winner_email,'private@example.com');
});
test('auction readiness is checked inside the creation transaction and failures roll back',async()=>{const body={bikeId:2,startingPrice:50000,minIncrement:500,startsAt:new Date(NOW).toISOString(),endsAt:new Date(NOW+60000).toISOString()},f=fixture({status:'closed',result:'unsold'});let checked=false;await assert.rejects(()=>f.model.create(body,9,async(conn,id)=>{checked=!!conn.query&&id===2;throw Error('Main admin handover required');}),/handover required/);assert.equal(checked,true);assert.equal(f.state.commits,0);});
