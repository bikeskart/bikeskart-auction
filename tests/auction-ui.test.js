const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function screen(admin,fetcher){
  const elements=new Map(),listeners={};
  function element(id){if(!elements.has(id)){const handlers={};elements.set(id,{id,hidden:false,open:false,textContent:'',innerHTML:'',value:'',disabled:false,min:'',dataset:{},elements:{startsAt:{},endsAt:{}},classList:{contains:()=>true},addEventListener(type,fn){handlers[type]=fn;},handlers,reset(){this.resetCount=(this.resetCount||0)+1;},close(){this.open=false;this.handlers.close?.();},showModal(){this.open=true;}});}return elements.get(id);}
  const classes=new Set();
  const document={body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}},hidden:false,getElementById(id){if(admin&&['dealerLogin'].includes(id)||!admin&&id==='auctionForm')return null;return element(id);},querySelectorAll(){return [];}};
  const window={addEventListener(type,fn){listeners[type]=fn;},bkAdminApi:fetcher};
  const formData=class {constructor(form){this.values=form.data||{};}*[Symbol.iterator](){yield*Object.entries(this.values);}};
  const storage=new Map();
  const context={document,window,location:{search:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:fetcher,Headers,URLSearchParams,FormData:formData,Intl,Date,console,crypto:require('node:crypto').webcrypto,setInterval(){}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../auction.js'),'utf8'),context);
  return {elements,element,listeners,document};
}
const response=data=>({ok:true,status:200,json:async()=>data});
test('admin scheduling retains form after asynchronous requests and sends timezone dates',async()=>{
  let created;
  const s=screen(true,async(url,opts)=>{if(opts?.method==='POST'){created=JSON.parse(opts.body);return response({auction:{id:1}});}return response({rows:[],total:0,serverNow:new Date().toISOString()});});
  const form=s.element('auctionForm');form.data={bikeId:'2',startingPrice:'50000',minIncrement:'500',startsAt:'2026-10-06T12:00',endsAt:'2026-10-06T13:00'};
  const button={disabled:false},event={preventDefault(){},currentTarget:form,submitter:button};
  const promise=form.handlers.submit(event);event.currentTarget=null;await promise;
  assert.equal(form.resetCount,1);assert.match(created.startsAt,/Z$/);assert.match(s.element('auctionAdminMsg').textContent,/scheduled/);assert.equal(button.disabled,false);
});
test('a lost bid response retries the same request ID without a duplicate submission',async()=>{
  let sent=[],fail=true;
  const lot={id:1,bike_id:2,phase:'live',status:'open',starting_price:50000,min_increment:500,minimum_bid:50000,starts_at:new Date(Date.now()-1000).toISOString(),ends_at:new Date(Date.now()+60000).toISOString()};
  const s=screen(false,async(url,opts)=>{
    if(url==='/api/auth/refresh')return response({accessToken:'token'});
    if(url==='/api/auth/me')return response({user:{id:3,role:'dealer'}});
    if(url.includes('/bids')){sent.push(JSON.parse(opts.body));if(fail){fail=false;throw new Error('Network response lost');}return response({amount:50000});}
    if(url==='/api/auctions/1')return response({auction:lot,bike:{brand:'Honda',model:'Activa',images:[]},bids:[],serverNow:new Date().toISOString()});
    return response({rows:[lot],total:1,serverNow:new Date().toISOString()});
  });
  await new Promise(r=>setImmediate(r));
  await s.element('dealerAuctions').onclick({target:{closest:selector=>selector==='[data-lot]'?({dataset:{lot:'1'}}):null}});
  s.element('bidAmount').value='50000';const button={disabled:false};
  const event={preventDefault(){},submitter:button};await s.element('bidForm').onsubmit(event);await s.element('bidForm').onsubmit(event);
  assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(s.element('bidMsg').textContent,'');assert.equal(button.disabled,false);
});
test('auction titles and winner details escape injected HTML',async()=>{
  const s=screen(true,async url=>response(url.endsWith('/access')?{scopes:['inventory','accounts','auctions']}:url.includes('accounts')?{rows:[],total:0}:url.includes('bikes')?{rows:[]}: {rows:[{id:1,bike_id:2,brand:'<img onerror=evil()>',model:'Bike',phase:'ended',status:'closed',result:'sold',starting_price:50000,reserve_price:50000,winner_name:'<script>evil()</script>',starts_at:new Date().toISOString(),ends_at:new Date().toISOString()}],total:1,serverNow:new Date().toISOString()}));
  await s.listeners['bk-admin-ready']();const html=s.element('adminAuctions').innerHTML;assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img onerror=evil()&gt;'));
});
test('restoring a dealer session shows running auction cards immediately and logout restores homepage',async()=>{
  const now=new Date().toISOString();
  const s=screen(false,async url=>response(url==='/api/auth/refresh'?{accessToken:'token'}:url==='/api/auth/me'?{user:{id:3,role:'dealer',full_name:'Dealer'}}:{rows:[{id:1,bike_id:2,brand:'Honda',model:'Activa',phase:'live',status:'open',starting_price:50000,min_increment:500,starts_at:now,ends_at:now,cover_image:'/uploads/bikes/photo.jpg'}],total:1,serverNow:now}));
  await new Promise(r=>setImmediate(r));
  assert.ok(s.document.body.classList.contains('dealer-mode'));
  assert.equal(s.element('dealerLogin').hidden,true);
  assert.equal(s.element('dealerHeading').textContent,'');
  assert.equal(s.element('dealerMsg').textContent,'');
  assert.equal(s.element('accountMenuLabel').textContent,'☰ Menu');
  assert.match(s.element('dealerAuctions').innerHTML,/Honda Activa/);
  assert.match(s.element('dealerAuctions').innerHTML,/photo.jpg/);
  await s.element('dealerLogout').onclick();
  assert.ok(!s.document.body.classList.contains('dealer-mode'));
  assert.equal(s.element('dealerLogin').hidden,false);
  assert.equal(s.element('accountMenuLabel').textContent,'☰ Menu');
});

test('card bidding retries a lost response with the same ID and includes swipeable photos',async()=>{
 let sent=[];const now=new Date().toISOString();
 const s=screen(false,async(url,opts)=>{
 if(url==='/api/auth/refresh')return response({accessToken:'token'});
 if(url==='/api/auth/me')return response({user:{id:3,role:'dealer'}});
 if(url.includes('/bids')){sent.push(JSON.parse(opts.body));if(sent.length===1)throw Error('Lost response');return response({amount:50000});}
 return response({rows:[{id:1,bike_id:2,brand:'Honda',model:'Activa',phase:'live',starting_price:50000,min_increment:500,bid_count:0,starts_at:now,ends_at:now,images:[{image_url:'/one.jpg'},{image_url:'/two.jpg'}]}],total:1,serverNow:now});
 });
 await new Promise(r=>setImmediate(r));assert.match(s.element('dealerAuctions').innerHTML,/two.jpg/);assert.match(s.element('dealerAuctions').innerHTML,/data-gallery/);
 const event={preventDefault(){},target:{dataset:{inlineBid:'1'},elements:{amount:{value:'50000'}}}};
 await s.element('dealerAuctions').handlers.submit(event);await s.element('dealerAuctions').handlers.submit(event);
 assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId);assert.doesNotMatch(s.element('dealerAuctions').innerHTML,/Bid accepted|Minimum bid/);
});
test('accounts-only staff initialization skips auction and bike-option requests',async()=>{const requested=[];const s=screen(true,async url=>{requested.push(url);return response(url.endsWith('/access')?{scopes:['accounts']}:{rows:[],total:0});});await s.listeners['bk-admin-ready']();assert.ok(requested.some(url=>url.includes('/accounts')));assert.ok(!requested.some(url=>url.startsWith('/api/auctions')));assert.ok(!requested.some(url=>url.includes('/bike-options')));});
test('only dealers with a losing live bid see the red Outbid marker',async()=>{for(const [my_bid,is_leading,marked]of [[50000,false,true],[55000,true,false],[null,false,false]]){const now=new Date().toISOString();const s=screen(false,async url=>response(url==='/api/auth/refresh'?{accessToken:'t'}:url==='/api/auth/me'?{user:{id:3,role:'dealer'}}:{rows:[{id:1,bike_id:2,brand:'Honda',model:'Activa',phase:'live',starting_price:50000,highest_bid:55000,min_increment:500,my_bid,is_leading,images:[]}],total:1,serverNow:now}));await new Promise(r=>setImmediate(r));assert.equal(s.element('dealerAuctions').innerHTML.includes('● Outbid'),marked);}});
test('vehicle info includes engine and chassis identifiers without an inspection rating',async()=>{const now=new Date().toISOString(),a={id:1,phase:'live',starting_price:50000,min_increment:500};const s=screen(false,async url=>response(url==='/api/auth/refresh'?{accessToken:'t'}:url==='/api/auth/me'?{user:{id:3,role:'dealer'}}:url==='/api/auctions/1'?{auction:a,bike:{brand:'Honda',model:'Activa',images:[],detail_profile:{engineNumber:'ENG123',chassisNumber:'CHS456',vehicleRating:5}},bids:[],serverNow:now}:{rows:[a],total:1,serverNow:now}));await new Promise(r=>setImmediate(r));await s.element('dealerAuctions').onclick({target:{closest:sel=>sel==='[data-lot]'?{dataset:{lot:'1'}}:null}});const html=s.element('lotDetail').innerHTML;assert.match(html,/ENG123/);assert.match(html,/CHS456/);assert.ok(!html.includes('Vehicle Rating'));});

// Native FCM tokens may arrive after the registration response.
test('pending registration registers a late native token before first dealer login',async()=>{
 const calls=[];
 const s=screen(false,async(url,opts)=>{calls.push({url,opts});if(url==='/api/auth/refresh')return {ok:false,status:401,json:async()=>({})};if(url==='/api/auth/register')return response({message:'Pending approval',pendingPushToken:'scoped-registration-credential'});return response({registered:true});});
 const form=s.element('dealerRegister');form.data={fullName:'Dealer',email:'dealer@example.com'};
 await form.onsubmit({preventDefault(){},currentTarget:form,submitter:{disabled:false}});
 assert.equal(calls.filter(c=>c.url.includes('pending-devices')).length,0);
 s.listeners['bk-push-token']({detail:{token:'native-device',enabled:true}});
 await new Promise(r=>setImmediate(r));
 const request=calls.find(c=>c.url==='/api/notifications/pending-devices');assert.ok(request);
 assert.deepEqual(JSON.parse(request.opts.body),{pendingPushToken:'scoped-registration-credential',token:'native-device',enabled:true});
 assert.ok(!calls.some(c=>c.url==='/api/notifications/devices'));
});
