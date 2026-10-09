const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'unused',DB_USER:'unused',DB_PASSWORD:'unused',DB_NAME:'unused',JWT_SECRET:'test-only-secret'});
const {signPendingPushToken,verifyPendingPushToken,signAccessToken,verifyAccessToken}=require('../src/utils/tokens');
const {deliverApprovals}=require('../src/utils/registrationNotifications');
test('pending push credentials cannot authenticate as access tokens and vice versa',()=>{
 const pending=signPendingPushToken({id:12});assert.equal(verifyPendingPushToken(pending).sub,12);
 assert.throws(()=>verifyAccessToken(pending));assert.throws(()=>verifyPendingPushToken(signAccessToken({id:12,role:'dealer'})));
});
function approvalPool({claim=1}={}){const calls=[];return {calls,async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT p.user_id'))return [[{user_id:12,token_hash:'hash',fcm_token:'device',attempts:0}]];return [{affectedRows:claim}];}};}
test('approval worker sends approval text without an auction ID and records success',async()=>{
 const pool=approvalPool();let message;await deliverApprovals(pool,{send:async(...args)=>message=args},console);
 assert.equal(message[1].title,'Registration approved');assert.equal(message[1].type,'registration_approved');assert.equal(message[1].auctionId,undefined);
 assert.ok(pool.calls.some(c=>c.sql.includes("state='sent'")));
});
test('approval worker honours lost claims and retries transient failures',async()=>{
 let sends=0;await deliverApprovals(approvalPool({claim:0}),{send:async()=>sends++},console);assert.equal(sends,0);
 const pool=approvalPool();await deliverApprovals(pool,{send:async()=>{throw Object.assign(new Error('temporary'),{code:'UNAVAILABLE'});}},{error(){}});
 const retry=pool.calls.find(c=>c.sql.includes('state=?'));assert.equal(retry.args[0],'pending');assert.equal(retry.args[2],30);
});
test('invalid approval devices are removed only for the matching dealer',async()=>{
 const pool=approvalPool();await deliverApprovals(pool,{send:async()=>{throw Object.assign(new Error(),{code:'UNREGISTERED',invalidToken:true});}},{error(){}});
 assert.deepEqual(pool.calls.find(c=>c.sql.startsWith('DELETE')).args,['hash',12]);
 assert.equal(pool.calls.find(c=>c.sql.includes('state=?')).args[0],'skipped');
});
let account={id:12,is_active:1,is_verified:0,role:'dealer'},events=0,commits=0,rolledBack=0,failUpdate=false;
const connection={async beginTransaction(){},async commit(){commits++;},async rollback(){rolledBack++;},release(){},async query(sql,args){
 if(sql.startsWith('SELECT id,is_active'))return [[{...account}]];
 if(sql.startsWith('UPDATE users')){if(failUpdate)throw new Error('database failed');account.is_verified=args[0];return [{affectedRows:1}];}
 if(sql.startsWith('INSERT IGNORE INTO dealer_approval_events')){events++;return [{affectedRows:1}];}
 throw new Error(sql);
}};
const mock=(path,value)=>{const file=require.resolve(path);require.cache[file]={id:file,filename:file,loaded:true,exports:value};};
mock('../src/config/db',{getConnection:async()=>connection});
mock('../src/models/userModel',{findById:async id=>id===1?{id:1,role:'admin',is_active:1,is_verified:1}:account});
mock('../src/middleware/adminPermissions',{requireAdminScope:()=>((req,res,next)=>next())});
mock('../src/utils/adminOperations',{audit:async()=>{}});
let registered=[];
mock('../src/utils/auctionNotifications',{worker:()=>({ensure:async()=>{},register:async(...args)=>registered.push(args),unregister:async()=>{}})});
const app=require('express')();app.use(require('express').json());app.use('/accounts',require('../src/routes/accountRoutes'));app.use('/notifications',require('../src/routes/notificationRoutes'));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});after(()=>new Promise(r=>server.close(r)));
const patch=body=>fetch(base+'/accounts/12',{method:'PATCH',headers:{Authorization:'Bearer '+signAccessToken({id:1,role:'admin'}),'Content-Type':'application/json'},body:JSON.stringify(body)});
test('admin approval queues one event atomically; repeated saves do not notify again',async()=>{
 assert.equal((await patch({is_verified:true})).status,200);assert.equal(events,1);assert.equal(commits,1);
 assert.equal((await patch({is_verified:true})).status,200);assert.equal(events,1);
 failUpdate=true;assert.equal((await patch({is_verified:false})).status,500);assert.equal(rolledBack,1);assert.equal(events,1);failUpdate=false;
});
test('pending device registration is scoped and requires a real active dealer',async()=>{
 const send=value=>fetch(base+'/notifications/pending-devices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pendingPushToken:value,token:'x'.repeat(100)})});
 account.is_verified=0;assert.equal((await send(signPendingPushToken(account))).status,201);assert.equal(registered[0][0],12);
 assert.equal((await send(signAccessToken(account))).status,401);account.is_active=0;assert.equal((await send(signPendingPushToken(account))).status,403);account.is_active=1;
});
