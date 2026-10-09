const fs=require('node:fs/promises');
const path=require('node:path');
const kinds=['new_auction','auction_live','winner','payment','invoice','pickup','delivered'];
function configuration(env=process.env){
  const templates=Object.fromEntries(kinds.map(k=>[k,env['WHATSAPP_TEMPLATE_'+k.toUpperCase()]]));
  const valid=env.WHATSAPP_ENABLED==='true' && /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')
    && /^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION||'') && Boolean(env.WHATSAPP_ACCESS_TOKEN) && Boolean(env.WHATSAPP_APP_SECRET) && Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    && kinds.every(k=>/^[a-z0-9_]{1,512}$/.test(templates[k]||''));
  return {enabled:valid,templates,language:env.WHATSAPP_TEMPLATE_LANGUAGE||'en',version:env.WHATSAPP_GRAPH_VERSION,phoneId:env.WHATSAPP_PHONE_NUMBER_ID};
}
function createWhatsAppSender({env=process.env,fetchImpl=fetch,uploadRoot}={}){
  const config=configuration(env);
  async function request(resource,options){
    let response;
    try{response=await fetchImpl(`https://graph.facebook.com/${config.version}/${config.phoneId}/${resource}`,{...options,headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,...options.headers},signal:AbortSignal.timeout(15000)});}
    catch{throw Object.assign(new Error('WhatsApp request outcome is unknown'),{code:'TRANSPORT_UNKNOWN',uncertain:true});}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error('WhatsApp API rejected request'),{code:String(data.error?.code||response.status),retryable:response.status===429||response.status>=500||data.error?.is_transient===true});
    return data;
  }
  async function send(event){
    if(!config.enabled)throw Object.assign(new Error('WhatsApp is not configured'),{code:'NOT_CONFIGURED'});
    if(!kinds.includes(event.kind)||!/^\d{8,15}$/.test(event.recipient))throw Object.assign(new Error('Invalid WhatsApp message'),{code:'INVALID_MESSAGE'});
    const components=[];
    if(event.kind==='invoice'){
      if(!uploadRoot||!/^\d+-[a-f0-9]{16}\.pdf$/.test(event.document_filename||''))throw Object.assign(new Error('Invoice PDF unavailable'),{code:'INVOICE_UNAVAILABLE'});
      let media;
      try{
        const file=path.join(uploadRoot,'rc',event.document_filename),stat=await fs.stat(file);
        if(!stat.isFile()||stat.size>8*1024*1024)throw new Error('Invalid invoice');
        const bytes=await fs.readFile(file);
        if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Invalid PDF');
        const body=new FormData();body.set('messaging_product','whatsapp');body.set('type','application/pdf');body.set('file',new Blob([bytes],{type:'application/pdf'}),`BikesKart-Invoice-Lot-${event.auction_id}.pdf`);
        media=await request('media',{method:'POST',body});
        if(!media.id)throw Object.assign(new Error('Media upload returned no ID'),{code:'MEDIA_ID_MISSING',retryable:true});
      }catch(error){error.uncertain=false;if(!error.code)error.code='INVOICE_UNAVAILABLE';if(error.code==='TRANSPORT_UNKNOWN')error.retryable=true;throw error;}
      components.push({type:'header',parameters:[{type:'document',document:{id:media.id,filename:`BikesKart-Invoice-Lot-${event.auction_id}.pdf`}}]});
    }
    components.push({type:'body',parameters:event.params.map(text=>({type:'text',text:String(text).replace(/[\r\n\t]+/g,' ').slice(0,1000)||'Not recorded'}))});
    const data=await request('messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:event.recipient,type:'template',template:{name:config.templates[event.kind],language:{code:config.language},components}})});
    if(!data.messages?.[0]?.id)throw Object.assign(new Error('WhatsApp acceptance is unknown'),{code:'MESSAGE_ID_MISSING',uncertain:true});
    return data.messages[0].id;
  }
  return {configured:()=>config.enabled,send};
}
module.exports={kinds,configuration,createWhatsAppSender};
