const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deliverOutbids}=require('../src/utils/outbidNotifications');
function pool({claim=1,ttl=60}={}){const calls=[];return {calls,async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT p.bid_id'))return [[{bid_id:9,auction_id:1,user_id:3,token_hash:'hash',fcm_token:'device',attempts:0,brand:'Honda',model:'Activa',ttl_seconds:ttl}]];return [{affectedRows:claim}];}};}
test('outbid alert targets the previous leader and opens the lot without revealing bidder identity',async()=>{
 const db=pool();let message;await deliverOutbids(db,{send:async(...args)=>message=args},console);
 assert.equal(message[1].type,'outbid');assert.equal(message[1].auctionId,'1');assert.equal(message[1].title,'You have been outbid');
 assert.ok(!('userId' in message[1]));assert.ok(db.calls.some(c=>c.sql.includes("state='sent'")));
 const claim=db.calls.find(c=>c.sql.includes("SET p.state='processing'"));assert.match(claim.sql,/a.highest_bidder_id<>e.user_id/);assert.match(claim.sql,/u.is_active=1 AND u.is_verified=1/);
});
test('expired lots and lost delivery claims cannot send outbid alerts',async()=>{
 for(const opts of [{claim:0},{ttl:0}]){let sent=0;await deliverOutbids(pool(opts),{send:async()=>sent++},console);assert.equal(sent,0);}
});
test('outbid temporary failures retry; invalid device tokens are removed',async()=>{
 for(const invalid of [false,true]){const db=pool();await deliverOutbids(db,{send:async()=>{throw Object.assign(new Error(),{code:invalid?'UNREGISTERED':'UNAVAILABLE',invalidToken:invalid});}},{error(){}});
 const retry=db.calls.find(c=>c.sql.includes('SET state=?'));assert.equal(retry.args[0],invalid?'skipped':'pending');assert.equal(retry.args[2],30);
 assert.equal(db.calls.some(c=>c.sql.startsWith('DELETE')),invalid);}
});
