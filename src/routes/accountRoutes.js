const express = require('express');
const pool = require('../config/db');
const {requireAuth} = require('../middleware/auth');
const {findById} = require('../models/userModel');
const {eligible,positiveId,fail} = require('../utils/auctionRules');
const router = express.Router();
router.use(requireAuth,(req,res,next) => findById(req.user.sub).then(u => {eligible(u,['admin']);next();}).catch(next));
router.get('/',async (req,res,next) => {
  try {
    const page = Math.min(Math.max(parseInt(req.query.page,10)||1,1),10000);
    const [rows] = await pool.query("SELECT id,role,full_name,email,is_verified,is_active FROM users WHERE role IN ('dealer','bidder') ORDER BY is_verified,id DESC LIMIT 50 OFFSET ?",[(page-1)*50]);
    const [[{total}]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role IN ('dealer','bidder')");
    res.json({rows,total,page});
  } catch(e) {next(e);}
});
router.patch('/:id',async (req,res,next) => {
  try {
    const id = positiveId(req.params.id),fields=[],values=[];
    for (const key of ['is_verified','is_active']) if (key in req.body) {
      if (typeof req.body[key] !== 'boolean') fail('Account flags must be true or false');
      fields.push(`${key} = ?`);values.push(Number(req.body[key]));
    }
    if (!fields.length) fail('No account change provided');
    const [r] = await pool.query(`UPDATE users SET ${fields.join(',')} WHERE id = ? AND role IN ('dealer','bidder')`,[...values,id]);
    if (!r.affectedRows) fail('Dealer or bidder not found',404);
    res.json({updated:true});
  } catch(e) {next(e);}
});
module.exports = router;
