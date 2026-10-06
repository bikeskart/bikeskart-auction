const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function screen(admin,fetcher){
  const elements=new Map(),listeners={};
  function element(id){if(!elements.has(id)){const handlers={};elements.set(id,{id,hidden:false,open:false,textContent:'',innerHTML:'',value:'',disabled:false,min:'',dataset:{},elements:{startsAt:{},endsAt:{}},classList:{contains:()=>true},addEventListener(type,fn){handlers[type]=fn;},handlers,reset(){this.resetCount=(this.resetCount||0)+1;},close(){this.open=false;this.handlers.close?.();},showModal(){this.open=true;}});}return elements.get(id);}
  const document={hidden:false,getElementById(id){if(admin&&['dealerLogin'].includes(id)||!admin&&id==='auctionForm')return null;return element(id);},querySelectorAll(){return [];}};
  const window={addEventListener(type,fn){listeners[type]=fn;},bkAdminApi:fetcher};
  const formData=class {constructor(form){this.values=form.data||{};}*[Symbol.iterator](){yield*Object.entries(this.values);}};
  const context={document,window,fetch:fetcher,Headers,FormData:formData,Intl,Date,console,crypto:require('node:crypto').webcrypto,setInterval(){}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../auction.js'),'utf8'),context);
  return {elements,element,listeners};
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
  await s.element('dealerAuctions').onclick({target:{closest:()=>({dataset:{lot:'1'}})}});
  s.element('bidAmount').value='50000';const button={disabled:false};
  const event={preventDefault(){},submitter:button};await s.element('bidForm').onsubmit(event);await s.element('bidForm').onsubmit(event);
  assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId);assert.match(s.element('bidMsg').textContent,/Bid accepted/);assert.equal(button.disabled,false);
});
test('auction titles and winner details escape injected HTML',async()=>{
  const s=screen(true,async url=>response(url.includes('accounts')?{rows:[],total:0}:url.includes('bikes')?{rows:[]}: {rows:[{id:1,bike_id:2,brand:'<img onerror=evil()>',model:'Bike',phase:'ended',status:'closed',result:'sold',starting_price:50000,reserve_price:50000,winner_name:'<script>evil()</script>',starts_at:new Date().toISOString(),ends_at:new Date().toISOString()}],total:1,serverNow:new Date().toISOString()}));
  await s.listeners['bk-admin-ready']();const html=s.element('adminAuctions').innerHTML;assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img onerror=evil()&gt;'));
});
