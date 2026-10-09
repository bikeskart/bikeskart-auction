const express = require('express');
const rateLimit = require('express-rate-limit');
const {requireAuth} = require('../middleware/auth');
const users = require('../models/userModel');
const {eligible} = require('../utils/auctionRules');
const {worker} = require('../utils/auctionNotifications');
const router=express.Router();
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.use(rateLimit({windowMs:60000,max:20,standardHeaders:true,legacyHeaders:false}));
// Pending dealers authenticate with a narrowly scoped registration credential.
router.post('/pending-devices',asyncRoute(async(req,res)=>{
  let credential;
  try { credential=require('../utils/tokens').verifyPendingPushToken(req.body.pendingPushToken); }
  catch { return res.status(401).json({error:'Invalid or expired registration credential'}); }
  const user=await users.findById(credential.sub);
  if(!user||!user.is_active||!['dealer','bidder'].includes(user.role))return res.status(403).json({error:'An active dealer account is required'});
  if(req.body.enabled===false)await worker().unregister(user.id,req.body.token);
  else await worker().register(user.id,req.body.token);
  res.status(201).json({registered:req.body.enabled!==false});
}));
router.use(requireAuth);
router.post('/devices',asyncRoute(async(req,res)=>{const user=await users.findById(req.user.sub);eligible(user,['dealer','bidder']);await worker().register(user.id,req.body.token);res.status(201).json({registered:true});}));
router.delete('/devices',asyncRoute(async(req,res)=>{await worker().unregister(req.user.sub,req.body.token);res.json({removed:true});}));
module.exports=router;
