const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('permissions initialize navigation even when an optional tab is absent',async()=>{
 const nodes=new Map(),events=[],handlers={};
 const element=id=>{if(['tab-completed','accountList','adminRegistrationForm'].includes(id))return null;if(!nodes.has(id))nodes.set(id,{id,hidden:false,innerHTML:'',textContent:'',dataset:{},parentElement:{append(){},addEventListener(){}},setAttribute(){},addEventListener(){},append(){},matches(){return false;}});return nodes.get(id);};
 const document={hidden:false,head:{append(){}},getElementById:element,createElement:()=>element('generated-'+nodes.size),querySelector:s=>s==='.admin-tabs'?element('tabs'):null};
 const window={bkAdminApi:async()=>({ok:true,json:async()=>({scopes:['auctions']})}),addEventListener:(name,fn)=>handlers[name]=fn,dispatchEvent:e=>events.push(e.type)};
 vm.runInNewContext(fs.readFileSync(require.resolve('../admin-ops.js'),'utf8'),{document,window,console,Event,setInterval(){},Map,Intl});
 await handlers['bk-admin-ready']();
 assert.ok(events.includes('bk-admin-permissions'));assert.equal(element('tab-running').hidden,false);assert.equal(element('tab-bike').hidden,true);
});
