const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
Object.assign(process.env, { DB_HOST:'unused', DB_USER:'unused', DB_PASSWORD:'unused', DB_NAME:'unused', JWT_SECRET:'regression-only-secret', NODE_ENV:'test' });
const dbPath = require.resolve('../src/config/db');
const queries = [];
require.cache[dbPath] = { id:dbPath, filename:dbPath, loaded:true, exports:{
  query:async (sql, params) => {
    if(sql.startsWith("SELECT id,role,is_active,is_verified,admin_scopes"))return [[{id:1,role:"admin",is_active:1,is_verified:1,admin_scopes:null}]];
    if(sql.startsWith("SHOW COLUMNS FROM users"))return [[{Field:"admin_scopes"}]];
    if(sql.startsWith("CREATE TABLE IF NOT EXISTS admin_")||sql.startsWith("CREATE TABLE IF NOT EXISTS auction_confirmations"))return [[]];
    if(sql.startsWith("SELECT CAST(id AS CHAR) AS setting_value FROM users"))return [[{setting_value:"1"}]];
    if(sql.startsWith("INSERT INTO admin_settings"))return [{}];
    queries.push({sql,params});
    if (sql.startsWith('SELECT * FROM bikes')) return [[{id:1,rc_document_url:'/uploads/rc/regression.pdf'}]];
    if (sql.startsWith('SELECT id, image_url')) return [[]];
    if (sql.startsWith('INSERT INTO bikes')) return [{insertId:1}];
    return [[]];
  }
}};
const tokens = require('../src/utils/tokens');
const app = require('../server');
let server, base;
const rcPath = path.join(require('../src/middleware/upload').uploadRoot,'rc','regression.pdf');
before(async () => {
  fs.writeFileSync(rcPath,'%PDF-regression');
  server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { fs.unlinkSync(rcPath); await new Promise(resolve => server.close(resolve)); });
const bearer = role => ({Authorization:`Bearer ${tokens.signAccessToken({id:1,role,email:'test@example.com'})}`});
test('only public frontend assets are served', async () => {
  for (const url of ['/','/admin.html','/style.css','/app.js','/admin.js']) assert.equal((await fetch(base+url)).status,200,url);
  for (const url of ['/server.js','/package.json','/database/schema.sql','/src/config/env.js','/api/unknown']) assert.equal((await fetch(base+url)).status,404,url);
});
test('RC documents require an admin access token',async () => {
  assert.equal((await fetch(base+'/uploads/rc/regression.pdf')).status,404);
  assert.equal((await fetch(base+'/api/admin/bikes/1/rc')).status,401);
  assert.equal((await fetch(base+'/api/admin/bikes/1/rc',{headers:bearer('bidder')})).status,403);
  const res = await fetch(base+'/api/admin/bikes/1/rc',{headers:bearer('admin')});
  assert.equal(res.status,200); assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(await res.text(),'%PDF-regression');
});
test('refresh tokens cannot authenticate API calls and are unique',async () => {
  const user={id:1,role:'admin',email:'test@example.com'};
  const a=tokens.signRefreshToken(user), b=tokens.signRefreshToken(user);
  assert.notEqual(a,b);
  assert.throws(()=>tokens.verifyAccessToken(a));
  assert.throws(()=>tokens.verifyRefreshToken(tokens.signAccessToken(user)));
  assert.equal((await fetch(base+'/api/admin/ping',{headers:{Authorization:`Bearer ${a}`}})).status,401);
});
test('invalid bike values are rejected before database writes',async () => {
  queries.length=0;
  const form = new FormData();
  Object.entries({brand:'Honda',model:'Activa',year:'2024',kilometersDriven:'-1'}).forEach(([key,value])=>form.set(key,value));
  const res=await fetch(base+'/api/admin/bikes',{method:'POST',headers:bearer('admin'),body:form});
  assert.equal(res.status,400); assert.equal(queries.length,0);
});
test('zero kilometres survive bike creation',async () => {
  const {createBike}=require('../src/models/bikeModel');
  await createBike({dealerId:1,brand:'Honda',model:'Activa',year:2024,kilometersDriven:0,ownershipCount:1});
  const insert=queries.find(q=>q.sql.startsWith('INSERT INTO bikes'));
  assert.equal(insert.params[5],0);
});
test('upload extensions follow accepted MIME type',async () => {
  const form=new FormData();
  Object.entries({brand:'Honda',model:'Activa',year:'2024'}).forEach(([key,value])=>form.set(key,value));
  form.append('bikePhotos',new Blob(['regression'],{type:'image/jpeg'}),'photo.html');
  const res=await fetch(base+'/api/admin/bikes',{method:'POST',headers:bearer('admin'),body:form});
  assert.equal(res.status,201);
  const insert=queries.find(q=>q.sql.startsWith('INSERT INTO bike_images'));
  const url=insert.params[0][0][1]; assert.match(url,/\.jpg$/);
  fs.unlinkSync(path.join(require('../src/middleware/upload').uploadRoot,'bikes',path.basename(url)));
});
test('unsupported and oversized uploads show useful errors without database writes',async()=>{
  for (const [type,bytes,message] of [['image/heic','not-supported',/JPG, PNG or WEBP/],['image/jpeg',new Uint8Array(8*1024*1024+1),/8 MB/]]) {
    queries.length=0;
    const form=new FormData();
    Object.entries({brand:'Honda',model:'Activa',year:'2024'}).forEach(([key,value])=>form.set(key,value));
    form.append('bikePhotos',new Blob([bytes],{type}),'photo.jpg');
    const response=await fetch(base+'/api/admin/bikes',{method:'POST',headers:bearer('admin'),body:form});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,message);
    assert.equal(queries.length,0);
  }
});
test('production shows auction rule errors while hiding unexpected server errors',async()=>{
  const env=require('../src/config/env'),users=require('../src/models/userModel'),auctions=require('../src/models/auctionModel'),rules=require('../src/utils/auctionRules');
  const originals={nodeEnv:env.nodeEnv,findById:users.findById,create:auctions.create};
  try {
    env.nodeEnv='production';
    users.findById=async()=>({id:1,role:'admin',is_active:1,is_verified:1});
    auctions.create=async()=>rules.fail('This bike already has a winning auction',409);
    let res=await fetch(base+'/api/auctions',{method:'POST',headers:{...bearer('admin'),'Content-Type':'application/json'},body:'{"bikeId":1}'});
    assert.equal(res.status,409);assert.equal((await res.json()).error,'This bike already has a winning auction');
    auctions.create=async()=>{throw new Error('private database error');};
    res=await fetch(base+'/api/auctions',{method:'POST',headers:{...bearer('admin'),'Content-Type':'application/json'},body:'{"bikeId":1}'});
    assert.equal(res.status,500);assert.equal((await res.json()).error,'Something went wrong');
  } finally {env.nodeEnv=originals.nodeEnv;users.findById=originals.findById;auctions.create=originals.create;}
});

test('admin bike create and edit persist validated inspection fields',async()=>{
 for(const method of ['POST','PUT']){
  queries.length=0;const form=new FormData();Object.entries({brand:'Honda',model:'Activa',year:'2024',status:'draft',registrationYear:'2025',hpStatus:'No',keysCount:'0',engineCondition:'Good',vehicleRating:'4'}).forEach(([k,v])=>form.set(k,v));
  const res=await fetch(base+'/api/admin/bikes'+(method==='PUT'?'/1':''),{method,headers:bearer('admin'),body:form});assert.equal(res.status,method==='POST'?201:200);
  const write=queries.find(q=>q.sql.startsWith(method==='POST'?'INSERT INTO bikes':'UPDATE bikes'));assert.ok(write.sql.includes('detail_profile'));const profile=write.params.find(v=>typeof v==='string'&&v.startsWith('{'));assert.deepEqual(JSON.parse(profile),{registrationYear:2025,hpStatus:'No',keysCount:0,engineCondition:'Good',vehicleRating:4});
 }
});
test('invalid inspection is rejected before bike database writes',async()=>{
 queries.length=0;const form=new FormData();Object.entries({brand:'Honda',model:'Activa',year:'2024',vehicleRating:'9'}).forEach(([k,v])=>form.set(k,v));const res=await fetch(base+'/api/admin/bikes',{method:'POST',headers:bearer('admin'),body:form});assert.equal(res.status,400);assert.equal(queries.length,0);
});
