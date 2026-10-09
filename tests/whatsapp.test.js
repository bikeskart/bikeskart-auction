const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {auctionEvents,saleEvents}=require('../src/utils/whatsappEvents');
const {createWhatsAppSender,configuration,kinds}=require('../src/utils/whatsappCloud');
const {createWhatsAppWorker}=require('../src/utils/whatsappNotifications');
const base={auction_id:1,user_id:3,winner_id:3,status:'closed',result:'sold',highest_bid:'50000',phone:'9876543210',consent_phone:'919876543210',full_name:'Dealer',brand:'Honda',model:'Activa',registration_number:'KA01AA1234',transactions_enabled:1,auctions_enabled:1,transaction_opted_at:'2026-10-08 00:00:00',auction_opted_at:'2026-10-08 00:00:00',confirmed_at:'2026-10-09 00:00:00',bike_updated_at:'2026-10-09 01:00:00',created_at:'2026-10-09 00:00:00',starts_at:'2026-10-09 02:00:00',ends_at:'2026-10-09 03:00:00'};
const paid={salePrice:'50000',paymentReceived:'50000',paymentConfirmed:true,paymentReference:'UPI123',buyerPhone:'9876543210',documents:[{kind:'saleInvoice',filename:'123-0123456789abcdef.pdf'}],pickupReady:true,pickupLocation:'BikesKart warehouse, Bengaluru',pickupMapUrl:'https://maps.google.com/?q=Bengaluru',pickupContact:'9900935354',pickupInstructions:'Call before arrival'};
test('new auctions and live messages respect opt-in time and live windows',()=>{
 const row={...base,status:'open'};
 assert.equal(auctionEvents(row,Date.parse('2026-10-09T01:00:00Z'))[0].kind,'new_auction');
 assert.equal(auctionEvents(row,Date.parse('2026-10-09T02:00:00Z'))[0].kind,'auction_live');
 assert.equal(auctionEvents(row,Date.parse('2026-10-09T03:00:00Z')).length,0);
 assert.equal(auctionEvents({...row,auctions_enabled:0}).length,0);
 assert.equal(auctionEvents({...row,auction_opted_at:'2026-10-10 00:00:00'},Date.parse('2026-10-09T01:00:00Z')).length,0);
});
test('winner needs admin confirmation; payment, PDF invoice and pickup need confirmed full payment',()=>{
 const row={...base,sale_profile:paid};assert.deepEqual(saleEvents(row).map(e=>e.kind),['winner','payment','invoice','pickup']);
 for(const patch of [{paymentReceived:'49999'},{paymentConfirmed:false}])assert.deepEqual(saleEvents({...row,sale_profile:{...paid,...patch}}).map(e=>e.kind),['winner']);
 assert.equal(saleEvents({...row,confirmed_at:null}).length,0);
 assert.deepEqual(saleEvents({...row,sale_profile:{...paid,pickupReady:false}}).map(e=>e.kind),['winner','payment','invoice']);
 assert.equal(saleEvents({...row,sale_profile:{...paid,documents:[{kind:'saleReceipt',filename:'123-0123456789abcdef.pdf'}]}}).some(e=>e.kind==='invoice'),false);
});
test('invoice and payment cannot leak to a substituted buyer or changed consent number',()=>{
 for(const patch of [{winner_id:99},{consent_phone:'919999999999'},{transactions_enabled:0},{sale_profile:{...paid,buyerPhone:'9999999999'}}])assert.equal(saleEvents({...base,sale_profile:paid,...patch}).length,0);
});
test('delivery confirmation replaces pickup and uses recorded collector/date',()=>{
 const messages=saleEvents({...base,sale_profile:{...paid,deliveryReleased:true,collectedBy:'Buyer',deliveryDate:'2026-10-09'}});
 assert.equal(messages.some(e=>e.kind==='pickup'),false);assert.deepEqual(messages.find(e=>e.kind==='delivered').params.slice(-2),['2026-10-09','Buyer']);
});
const config=()=>({WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'1234',WHATSAPP_GRAPH_VERSION:'v99.0',WHATSAPP_ACCESS_TOKEN:'private-token',WHATSAPP_APP_SECRET:'private-app-secret',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'private-verify-token',...Object.fromEntries(kinds.map(k=>['WHATSAPP_TEMPLATE_'+k.toUpperCase(),'bk_'+k]))});
test('Cloud API remains disabled until explicitly enabled with all settings and template names',()=>{
 assert.equal(configuration({}).enabled,false);assert.equal(configuration(config()).enabled,true);assert.equal(configuration({...config(),WHATSAPP_ENABLED:'false'}).enabled,false);
});
test('Cloud API sends approved templates with correct positional parameters and keeps token in header',async()=>{
 let request;const sender=createWhatsAppSender({env:config(),fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({messages:[{id:'wamid.123'}]})};}});
 assert.equal(await sender.send(saleEvents(base)[0]),'wamid.123');const payload=JSON.parse(request.options.body);
 assert.equal(payload.template.name,'bk_winner');assert.equal(payload.to,'919876543210');assert.equal(payload.template.components[0].parameters.length,6);
 assert.ok(!request.options.body.includes('private-token'));assert.equal(request.options.headers.Authorization,'Bearer private-token');
});
test('PDF invoice is uploaded privately and attached by media ID',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bk-wa-'));await fs.mkdir(path.join(root,'rc'));await fs.writeFile(path.join(root,'rc','123-0123456789abcdef.pdf'),'%PDF-1.4\nInvoice');const requests=[];
 try{const sender=createWhatsAppSender({env:config(),uploadRoot:root,fetchImpl:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.endsWith('/media')?{id:'private-media'}:{messages:[{id:'wamid.invoice'}]}};}});
 await sender.send(saleEvents({...base,sale_profile:paid}).find(e=>e.kind==='invoice'));
 assert.ok(requests[0].options.body instanceof FormData);const payload=JSON.parse(requests[1].options.body);assert.equal(payload.template.components[0].parameters[0].document.id,'private-media');assert.ok(!requests[1].options.body.includes(root));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('definitive temporary failures can retry but ambiguous message timeouts do not',async()=>{
 const event=saleEvents(base)[0];let sender=createWhatsAppSender({env:config(),fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{code:130429}})})});
 await assert.rejects(sender.send(event),e=>e.retryable===true&&!e.uncertain);
 sender=createWhatsAppSender({env:config(),fetchImpl:async()=>{throw Error('timeout');}});await assert.rejects(sender.send(event),e=>e.uncertain===true);
});
function deliveryPool(row=base){const calls=[];return {calls,async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT a.id AS'))return [[{...row,role:'dealer',is_active:1,is_verified:1}]];return [{affectedRows:1}];}};}
test('worker rechecks current winner/consent/payment before sending, and records acceptance only',async()=>{
 const db=deliveryPool();let sent=0;const worker=createWhatsAppWorker(db,{sender:{configured:()=>true,send:async()=>{sent++;return 'wamid.accepted';}}});
 await worker.deliver({event_key:'winner:1:3',kind:'winner',user_id:3,auction_id:1,recipient:'919876543210',attempts:0});assert.equal(sent,1);assert.ok(db.calls.some(c=>c.sql.includes("state='accepted'")));assert.ok(!db.calls.some(c=>c.sql.includes("state='delivered'")));
 const wrong=deliveryPool({...base,winner_id:99});sent=0;await createWhatsAppWorker(wrong,{sender:{configured:()=>true,send:async()=>sent++}}).deliver({event_key:'winner:1:3',user_id:3,auction_id:1,recipient:'919876543210'});assert.equal(sent,0);assert.ok(wrong.calls.some(c=>c.sql.includes("state='skipped'")));
});
test('worker quarantines ambiguous sends and backs off definite transient failures',async()=>{
 for(const uncertain of [false,true]){const db=deliveryPool();const worker=createWhatsAppWorker(db,{sender:{configured:()=>true,send:async()=>{throw Object.assign(new Error(),{code:'FAIL',retryable:true,uncertain});}},log:{error(){}}});await worker.deliver({event_key:'winner:1:3',user_id:3,auction_id:1,recipient:'919876543210',attempts:0});assert.equal(db.calls.find(c=>c.sql.includes('SET state=?')).args[0],uncertain?'uncertain':'pending');}
});
test('pickup map accepts HTTPS links and rejects dangerous schemes',()=>{
 const ops=require('../src/utils/adminOperations');assert.equal(ops.parseOperations({pickupMapUrl:'https://maps.google.com'},{}).pickupMapUrl,'https://maps.google.com');assert.throws(()=>ops.parseOperations({pickupMapUrl:'javascript:alert(1)'},{}));
});

test('repeated worker scans deduplicate the live auction message after acceptance',async()=>{
 const now=Date.now(),row={...base,status:'open',starts_at:new Date(now-30000).toISOString(),ends_at:new Date(now+60000).toISOString(),auction_opted_at:new Date(now-60000).toISOString(),is_active:1,is_verified:1,role:'dealer'};
 const outbox=new Map();let sends=0;
 const db={async query(sql,args=[]){
  if(sql.startsWith('SHOW COLUMNS'))return [[{Field:'admin_scopes'},{Field:'sale_profile'}]];
  if(sql.startsWith('SELECT a.id FROM auctions'))return [[{id:1}]];
  if(sql.startsWith('SELECT a.id AS')){if(sql.includes("a.status='closed'"))return [[]];return [[row]];}
  if(sql.startsWith('INSERT IGNORE INTO dealer_whatsapp_outbox')){if(!outbox.has(args[0]))outbox.set(args[0],{event_key:args[0],kind:args[1],auction_id:args[2],user_id:args[3],recipient:args[4],state:'pending',attempts:0});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT event_key'))return [[...outbox.values()].filter(r=>r.state==='pending')];
  if(sql.includes("SET state='processing'")){const r=outbox.get(args[0]);if(!r||r.state!=='pending')return [{affectedRows:0}];r.state='processing';return [{affectedRows:1}];}
  if(sql.includes("SET state='accepted'")){outbox.get(args[1]).state='accepted';return [{affectedRows:1}];}
  return [{affectedRows:0}];
 }};
 const worker=createWhatsAppWorker(db,{sender:{configured:()=>true,send:async()=>{sends++;return 'wamid.live';}}});await worker.run();await worker.run();assert.equal(sends,1);assert.equal(outbox.size,1);
});
test('an unconfigured WhatsApp worker neither discovers nor sends anything',async()=>{
 let queried=0;const worker=createWhatsAppWorker({query:async()=>queried++},{sender:{configured:()=>false}});await worker.run();assert.equal(queried,0);
});
