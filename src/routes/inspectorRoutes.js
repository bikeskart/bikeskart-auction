const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const db=require('../config/db');
const env=require('../config/env');
const {requireAuth}=require('../middleware/auth');
const {requireAdminScope}=require('../middleware/adminPermissions');
const {authLimiter}=require('../middleware/rateLimit');
const router=express.Router();
function inspectorAuth(req,res,next){
 const match=/^Bearer (.+)$/.exec(req.headers.authorization||'');
 if(!match)return res.status(401).json({error:'Inspector authentication required'});
 try{
  const token=jwt.verify(match[1],env.jwt.accessSecret);
  if(token.token_use!=='inspector_access'||token.role!=='inspector')throw Error('Wrong token');
  req.inspectorId=token.sub;next();
 }catch{return res.status(401).json({error:'Invalid or expired inspector token'});}
}
router.post('/login',authLimiter,async(req,res,next)=>{
 try{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if(!email||!password)return res.status(400).json({error:'Email and password required'});
  const [[u]]=await db.query('SELECT id,full_name,email,password_hash,is_active FROM inspector_accounts WHERE email=?',[email]);
  // Equal-cost verification when account is unknown.
  const hash=u?.password_hash||'$2a$12$C6UzMDM.H6dfI/f/IKcEeO7zQxBz6QQr0O5q3h3.3Hn5fXx7p0LZi';
  const valid=await bcrypt.compare(password,hash);
  if(!u||!u.is_active||!valid)return res.status(401).json({error:'Invalid credentials'});
  const token=jwt.sign({sub:u.id,role:'inspector',token_use:'inspector_access'},env.jwt.accessSecret,{expiresIn:'8h'});
  res.json({accessToken:token,tokenType:'Bearer',expiresIn:28800,inspector:{id:u.id,fullName:u.full_name,email:u.email}});
 }catch(e){next(e);}
});
router.get('/me',inspectorAuth,async(req,res,next)=>{
 try{
  const [[u]]=await db.query('SELECT id,full_name,email,is_active FROM inspector_accounts WHERE id=?',[req.inspectorId]);
  if(!u||!u.is_active)return res.status(403).json({error:'Account disabled'});
  res.json({id:u.id,fullName:u.full_name,email:u.email});
 }catch(e){next(e);}
});
router.get('/assignments',inspectorAuth,async(req,res,next)=>{
 try{
  const [[u]]=await db.query('SELECT is_active FROM inspector_accounts WHERE id=?',[req.inspectorId]);
  if(!u||!u.is_active)return res.status(403).json({error:'Account disabled'});
  const [rows]=await db.query(`SELECT a.id,a.bike_id AS bikeId,a.status,a.assigned_at AS assignedAt,
   b.brand,b.model,b.year,b.registration_number AS registrationNumber
   FROM inspector_assignments a JOIN bikes b ON b.id=a.bike_id
   WHERE a.inspector_id=? ORDER BY a.assigned_at DESC LIMIT 100`,[req.inspectorId]);
  res.json({assignments:rows});
 }catch(e){next(e);}
});
router.post('/admin/accounts',requireAuth,requireAdminScope(),async(req,res,next)=>{
 try{
  const fullName=String(req.body?.fullName||'').trim();
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if(fullName.length<2||fullName.length>150||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||password.length>72)
   return res.status(400).json({error:'Valid name, email and password of 12–72 characters required'});
  const hash=await bcrypt.hash(password,12);
  const [result]=await db.query('INSERT INTO inspector_accounts (full_name,email,password_hash,created_by) VALUES (?,?,?,?)',[fullName,email,hash,req.user.sub]);
  res.status(201).json({id:result.insertId,fullName,email});
 }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Email already registered'});next(e);}
});
router.post('/admin/assignments',requireAuth,requireAdminScope(),async(req,res,next)=>{
 try{
  const inspectorId=Number(req.body?.inspectorId),bikeId=Number(req.body?.bikeId);
  if(!Number.isSafeInteger(inspectorId)||inspectorId<1||!Number.isSafeInteger(bikeId)||bikeId<1)return res.status(400).json({error:'Valid inspectorId and bikeId required'});
  const [[u]]=await db.query('SELECT id FROM inspector_accounts WHERE id=? AND is_active=1',[inspectorId]);
  const [[b]]=await db.query('SELECT id FROM bikes WHERE id=?',[bikeId]);
  if(!u||!b)return res.status(404).json({error:'Inspector or bike not found'});
  const [result]=await db.query('INSERT INTO inspector_assignments (inspector_id,bike_id) VALUES (?,?)',[inspectorId,bikeId]);
  res.status(201).json({id:result.insertId,inspectorId,bikeId,status:'assigned'});
 }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Bike already assigned to this inspector'});next(e);}
});
module.exports=router;
