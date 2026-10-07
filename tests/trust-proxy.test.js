const {test}=require('node:test'),assert=require('node:assert/strict');
const {trustProxyHops}=require('../src/utils/trustProxy');
test('proxy hops are bounded and never accept blanket trust',()=>{
 assert.equal(trustProxyHops('production'),1);assert.equal(trustProxyHops('test'),0);
 assert.equal(trustProxyHops('production','0'),0);assert.equal(trustProxyHops('production','2'),2);
 for(const value of ['true','-1','1.5','17','', '1abc'])assert.throws(()=>trustProxyHops('production',value));
});
test('forwarded clients have independent limits and cannot select a spoofed leftmost address',async()=>{
 const app=require('express')();app.set('trust proxy',trustProxyHops('production'));
 app.use(require('express-rate-limit')({windowMs:60000,max:1}));app.get('/',(req,res)=>res.json({ip:req.ip}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const url='http://127.0.0.1:'+server.address().port,request=ip=>fetch(url,{headers:{'X-Forwarded-For':ip}});
 let r=await request('192.0.2.1');assert.equal(r.status,200);assert.equal((await r.json()).ip,'192.0.2.1');
 assert.equal((await request('192.0.2.1')).status,429);
 assert.equal((await request('192.0.2.2')).status,200);
 assert.equal((await request('198.51.100.3, 192.0.2.1')).status,429);
 }finally{await new Promise(r=>server.close(r));}
});
