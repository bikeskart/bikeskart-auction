const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
Object.assign(process.env,{DB_HOST:'unused',DB_USER:'unused',DB_PASSWORD:'unused',DB_NAME:'unused',JWT_SECRET:'test-only-secret',WHATSAPP_APP_SECRET:'test-app-secret',WHATSAPP_PHONE_NUMBER_ID:'1234',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'verify-me'});
const calls=[],users=new Map([[1,{id:1,role:'admin',is_active:1,is_verified:1,admin_scopes:null}],[2,{id:2,role:'admin',is_active:1,is_verified:1,admin_scopes:'["notifications"]'}],[3,{id:3,role:'dealer',is_active:1,is_verified:1,phone:'9876543210'}]]);
const pool={async query(sql,args){calls.push({sql,args});
 if(sql.startsWith('SHOW COLUMNS'))return [[{Field:'admin_scopes'},{Field:'sale_profile'}]];
 if(sql.startsWith('SELECT CAST(id AS CHAR)'))return [[{setting_value:'1'}]];
 if(sql.startsWith('SELECT id,role')||sql.startsWith('SELECT id,phone'))return [[users.get(Number(args[0]))]];
 if(sql.startsWith('SELECT transactions_enabled'))return [[]];
 if(sql.startsWith('SELECT state,COUNT')||sql.startsWith('SELECT kind,'))return [[]];
 return [{affectedRows:1}];
}};
const mock=(path,value)=>{const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports:value};};
mock('../src/config/db',pool);mock('../src/models/userModel',{findById:async id=>users.get(Number(id))});
const router=require('../src/routes/whatsappRoutes');const tokens=require('../src/utils/tokens');
const app=require('express')();app.use(require('express').json({verify:(req,res,bytes)=>req.rawBody=bytes}));app.use('/whatsapp',router);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
let server,base;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});after(()=>new Promise(r=>server.close(r)));
const headers=id=>({'Content-Type':'application/json',Authorization:'Bearer '+tokens.signAccessToken(users.get(id))});
test('dealer controls only own preferences, defaults are off and admin status is private',async()=>{
 assert.equal((await fetch(base+'/whatsapp/preferences')).status,401);
 const data=await(await fetch(base+'/whatsapp/preferences',{headers:headers(3)})).json();assert.deepEqual(data,{transactions:false,auctions:false});
 assert.equal((await fetch(base+'/whatsapp/preferences',{method:'PUT',headers:headers(3),body:JSON.stringify({transactions:true,auctions:false,user_id:99})})).status,200);
 assert.equal(calls.find(c=>c.sql.startsWith('INSERT INTO dealer_whatsapp_preferences')).args[0],3);
 assert.equal((await fetch(base+'/whatsapp/status',{headers:headers(3)})).status,403);assert.equal((await fetch(base+'/whatsapp/status',{headers:headers(2)})).status,403);assert.equal((await fetch(base+'/whatsapp/status',{headers:headers(1)})).status,200);
});
test('webhook verification and signature validation reject untrusted requests',async()=>{
 assert.equal((await fetch(base+'/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge')).status,403);
 assert.equal(await(await fetch(base+'/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=challenge')).text(),'challenge');
 const before=calls.length;assert.equal((await fetch(base+'/whatsapp/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);assert.equal(calls.length,before);
 assert.equal(router.signedWebhook(Buffer.from('{}'),'sha256='+'0'.repeat(64),'test-app-secret'),false);
});
test('signed delivery receipts are durable and STOP revokes matching-phone preferences',async()=>{
 const body=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:'1234'},statuses:[{id:'wamid.123',status:'delivered'}],messages:[{from:'919876543210',text:{body:'STOP'}}]}}]}]});
 const signature='sha256='+crypto.createHmac('sha256','test-app-secret').update(body).digest('hex');
 assert.equal((await fetch(base+'/whatsapp/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body})).status,200);
 const receipt=calls.find(c=>c.sql.startsWith('INSERT INTO dealer_whatsapp_receipts'));assert.equal(receipt.args[1],'delivered');assert.equal(receipt.args[2],3);
 const stop=calls.find(c=>c.sql.startsWith('UPDATE dealer_whatsapp_preferences SET'));assert.deepEqual(stop.args,['919876543210']);
});
