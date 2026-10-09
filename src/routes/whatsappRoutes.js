const express=require('express'),crypto=require('node:crypto');
const {requireAuth}=require('../middleware/auth');
const {requireAdminScope}=require('../middleware/adminPermissions');
const {eligible}=require('../utils/auctionRules');
const {worker}=require('../utils/whatsappNotifications');
const pool=require('../config/db');
const router=express.Router(),route=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
function signedWebhook(raw,signature,secret){
  if(!secret||!Buffer.isBuffer(raw)||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
  const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.slice(7),'hex'),Buffer.from(expected,'hex'));
}
router.get('/webhook',(req,res)=>{
  if(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN&&req.query['hub.mode']==='subscribe'&&req.query['hub.verify_token']===process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
});
router.post('/webhook',route(async(req,res)=>{
  if(!signedWebhook(req.rawBody,req.get('x-hub-signature-256'),process.env.WHATSAPP_APP_SECRET))return res.sendStatus(403);
  if(req.body.object!=='whatsapp_business_account')return res.sendStatus(400);
  await worker().ensure();
  for(const entry of req.body.entry||[])for(const change of entry.changes||[]){
    const value=change.value;
    if(!value||String(value.metadata?.phone_number_id)!==String(process.env.WHATSAPP_PHONE_NUMBER_ID))continue;
    for(const status of value.statuses||[])await require('../utils/whatsappReceipts').recordReceipt(pool,status);
    for(const message of value.messages||[]){
      const text=message.text?.body||message.button?.text||message.interactive?.button_reply?.id;
      if(typeof text==='string'&&/^(stop|unsubscribe|stop all)$/i.test(text.trim())&&/^\d{8,15}$/.test(message.from||''))
        await pool.query('UPDATE dealer_whatsapp_preferences SET transactions_enabled=0,auctions_enabled=0,updated_at=UTC_TIMESTAMP(3) WHERE phone=?',[message.from]);
    }
  }
  res.sendStatus(200);
}));
router.use(requireAuth);
// All other routes verify the current account rather than trusting JWT roles.
router.use((req,res,next)=>require('../models/userModel').findById(req.user.sub).then(user=>{eligible(user,['admin','dealer','bidder']);req.account=user;next();}).catch(next));
router.get('/preferences',route(async(req,res)=>{eligible(req.account,['dealer','bidder']);res.json(await worker().preferences(req.account.id));}));
router.put('/preferences',route(async(req,res)=>{
  eligible(req.account,['dealer','bidder']);const [[user]]=await pool.query('SELECT id,phone FROM users WHERE id=?',[req.account.id]);
  res.json(await worker().savePreferences(user,req.body));
}));
router.get('/status',requireAdminScope('owner'),route(async(req,res)=>{
  await worker().ensure();const [counts]=await pool.query('SELECT state,COUNT(*) AS total FROM dealer_whatsapp_outbox GROUP BY state');
  const [rows]=await pool.query('SELECT kind,auction_id,user_id,state,last_error,created_at,updated_at FROM dealer_whatsapp_outbox ORDER BY created_at DESC LIMIT 50');
  res.json({configured:worker().configured(),counts,rows});
}));
module.exports=router;
module.exports.signedWebhook=signedWebhook;
