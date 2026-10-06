const express = require('express');
const rateLimit = require('express-rate-limit');
const {requireAuth} = require('../middleware/auth');
const users = require('../models/userModel');
const model = require('../models/auctionModel');
const {positiveId,eligible} = require('../utils/auctionRules');
const asyncRoute = handler => (req,res,next) => Promise.resolve(handler(req,res)).catch(next);
const router = express.Router();
router.use(requireAuth);
router.use((req,res,next) => users.findById(req.user.sub).then(user => {
  eligible(user,['admin','dealer','bidder']); req.account = user; next();
}).catch(next));
const admin = (req,res,next) => req.account.role === 'admin' ? next() : res.status(403).json({error:'Administrator access required'});
router.get('/',asyncRoute(async (req,res) => {
  const page = Math.min(Math.max(parseInt(req.query.page,10)||1,1),10000);
  res.json(await model.list(req.account,page));
}));
router.post('/',admin,asyncRoute(async (req,res) => res.status(201).json({auction:await model.create(req.body,req.account.id)})));
router.get('/:id',asyncRoute(async (req,res) => res.json(await model.detail(positiveId(req.params.id),req.account))));
router.post('/:id/bids',rateLimit({windowMs:60000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'Please slow down and try again shortly.'}}),asyncRoute(async (req,res) => {
  res.status(201).json(await model.bid(positiveId(req.params.id),req.account.id,req.body));
}));
router.post('/:id/cancel',admin,asyncRoute(async (req,res) => res.json(await model.cancel(positiveId(req.params.id),req.account.id))));
module.exports = router;
