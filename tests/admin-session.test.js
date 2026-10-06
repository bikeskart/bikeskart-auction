const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function frontend(fetch){
  const elements=new Map();
  const document={getElementById(id){
    if(!elements.has(id)) elements.set(id,{value:'selected-file',textContent:'',innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},scrollIntoView(){},reset(){}});
    return elements.get(id);
  }};
  const context={document,fetch,Headers,FormData,URL,window:{},console};
  vm.createContext(context);
  let source=fs.readFileSync(require.resolve('../admin.js'),'utf8');
  source=source.replace('  (async () => {','  globalThis.hooks = {api,openBikeDetails};\n  (async () => {');
  vm.runInContext(source,context);
  return {hooks:context.hooks,elements};
}
test('expired requests refresh once and retry with the new token',async()=>{
  let calls=0,refreshes=0;
  const {hooks}=frontend(async(url,opts)=>{
    if(url==='/api/auth/refresh'){
      refreshes++;
      return refreshes===1 ? {ok:false} : {ok:true,json:async()=>({accessToken:'renewed'})};
    }
    calls++;
    if(calls===1) return {status:401};
    assert.equal(opts.headers.get('Authorization'),'Bearer renewed');
    return {status:200};
  });
  const res=await hooks.api('/test');
  assert.equal(res.status,200); assert.equal(calls,2);assert.equal(refreshes,2);
});
test('loading saved bike details clears upload selections',async()=>{
  const {hooks,elements}=frontend(async url=>url==='/api/auth/refresh' ? {ok:false} : {status:200,ok:true,json:async()=>({bike:{id:1,brand:'Honda',model:'Activa',year:2024,images:[]}})});
  await hooks.openBikeDetails(1);
  assert.equal(elements.get('editBikePhotos').value,'');
  assert.equal(elements.get('editRcDocument').value,'');
});
