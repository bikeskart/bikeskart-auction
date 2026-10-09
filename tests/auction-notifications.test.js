const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createFirebaseSender} = require('../src/utils/firebasePush');
const {createNotificationWorker,validToken,tokenHash,alertData} = require('../src/utils/auctionNotifications');

test('device tokens are validated and hashed without exposing their contents', () => {
  assert.equal(validToken('x'.repeat(100)+':test-token'),true);
  for (const value of [null,'short','x'.repeat(5000),'x'.repeat(30)+'\n']) assert.equal(validToken(value),false);
  assert.match(tokenHash('test'),/^[a-f0-9]{64}$/);
});
test('auction payload contains only public vehicle information and a lot ID', () => {
  const data = alertData({auction_id:42,brand:'Honda',model:'Activa',purchase_price:25000,customer_phone:'private'});
  assert.deepEqual(Object.keys(data).sort(),['auctionId','body','title']);
  assert.equal(data.auctionId,'42');assert.match(data.body,/Honda Activa/);
  assert.equal(JSON.stringify(data).includes('private'),false);
});
function fakePool({claim=1}={}) {
  const calls=[];
  return {calls,async query(sql,args) {
    calls.push({sql,args});
    if(sql.startsWith('SELECT p.user_id'))return [[]];
    if(sql.startsWith('SELECT p.auction_id'))return [[{auction_id:42,token_hash:'hash',attempts:0,fcm_token:'token',brand:'Honda',model:'Activa',ttl_seconds:120}]];
    if(sql.includes("SET p.state='processing'"))return [{affectedRows:claim}];
    return [{affectedRows:1}];
  }};
}
test('unconfigured Firebase does not query or send, leaving auctions usable', async()=>{
  const pool=fakePool();const worker=createNotificationWorker(pool,{sender:{configured:()=>false}});
  await worker.run();assert.equal(pool.calls.length,0);
});
test('worker uses eligible users and UTC live-window filters, then records delivery', async()=>{
  const pool=fakePool();let sent;
  const worker=createNotificationWorker(pool,{sender:{configured:()=>true,send:async(...args)=>{sent=args;}}});
  await worker.run();assert.equal(sent[1].auctionId,'42');assert.ok(sent[2]>=119&&sent[2]<=120);
  const enqueue=pool.calls.find(c=>c.sql.startsWith('INSERT IGNORE INTO auction_push_deliveries')).sql;
  assert.match(enqueue,/u.is_active=1 AND u.is_verified=1/);
  assert.match(enqueue,/a.starts_at <= UTC_TIMESTAMP\(3\) AND a.ends_at > UTC_TIMESTAMP\(3\)/);
  assert.ok(pool.calls.some(c=>c.sql.includes("SET state='sent'")));
});
test('lost concurrent claim does not send the notification twice',async()=>{
  const pool=fakePool({claim:0});let sends=0;
  const worker=createNotificationWorker(pool,{sender:{configured:()=>true,send:async()=>sends++}});
  await worker.run();assert.equal(sends,0);
});
test('invalid FCM device is removed, temporary failures are retried',async()=>{
  for(const invalid of [true,false]){
    const pool=fakePool();const error=Object.assign(new Error('failure'),{invalidToken:invalid,code:invalid?'UNREGISTERED':'UNAVAILABLE'});
    const worker=createNotificationWorker(pool,{sender:{configured:()=>true,send:async()=>{throw error;}},log:{error(){}}});
    await worker.run();assert.equal(pool.calls.some(c=>c.sql.startsWith('DELETE FROM dealer_push_devices')),invalid);
    if(!invalid){const retry=pool.calls.find(c=>c.sql.includes('available_at=UTC_TIMESTAMP(3)+INTERVAL ? SECOND'));assert.equal(retry.args[0],'pending');assert.equal(retry.args[2],30);}
  }
});
test('HTTP v1 sender signs OAuth assertion, caches token, and uses data-only high-priority messages',async()=>{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const account={type:'service_account',project_id:'test-project',client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
  const calls=[];
  const sender=createFirebaseSender({env:{FIREBASE_SERVICE_ACCOUNT_BASE64:Buffer.from(JSON.stringify(account)).toString('base64')},now:()=>1700000000000,fetchImpl:async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>url.includes('oauth2')?{access_token:'test-access',expires_in:3600}:{name:'test-message'}};
  }});
  await sender.send('device',{auctionId:'42'},120);await sender.send('device',{auctionId:'43'},60);
  assert.equal(calls.length,3);
  const parts=calls[0].options.body.get('assertion').split('.');
  assert.equal(crypto.verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2],'base64url')),true);
  const payload=JSON.parse(calls[1].options.body);
  assert.equal(payload.message.notification,undefined);assert.equal(payload.message.android.priority,'HIGH');assert.equal(payload.message.android.ttl,'120s');
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-access');
});
test('HTTP v1 UNREGISTERED response is classified without leaking credentials',async()=>{
  const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const account={type:'service_account',project_id:'test',client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
  const sender=createFirebaseSender({env:{FIREBASE_SERVICE_ACCOUNT_BASE64:Buffer.from(JSON.stringify(account)).toString('base64')},fetchImpl:async url=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'secret',expires_in:3600})}:{ok:false,status:404,json:async()=>({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}})}});
  await assert.rejects(sender.send('token',{auctionId:'1'},60),error=>error.invalidToken===true&&!error.message.includes('secret'));
});
