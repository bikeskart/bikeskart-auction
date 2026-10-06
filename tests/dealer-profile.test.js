const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ensureDealerProfile}=require('../src/utils/dealerProfile');
test('older schemas gain missing profile columns once without changing account records',async()=>{
 const calls=[];const pool={async query(sql){calls.push(sql);return [[{Field:'phone'}]];}};
 await Promise.all([ensureDealerProfile(pool),ensureDealerProfile(pool)]);
 assert.equal(calls.filter(sql=>sql.startsWith('SHOW')).length,1);
 assert.equal(calls.filter(sql=>sql.startsWith('ALTER')).length,2);
 assert.ok(!calls.some(sql=>sql.includes('ADD COLUMN phone')||/DELETE|DROP|UPDATE|INSERT/.test(sql)));
});
test('failed profile provisioning is retried and concurrent column additions are tolerated',async()=>{
 let fail=true;const pool={async query(sql){if(sql.startsWith('SHOW')){if(fail){fail=false;throw Error('unavailable');}return [[]];}throw Object.assign(Error('exists'),{code:'ER_DUP_FIELDNAME'});}};
 await assert.rejects(ensureDealerProfile(pool));await ensureDealerProfile(pool);
});
test('dealer registration requires a valid mobile number',async()=>{
 const {registerValidators}=require('../src/middleware/validators');
 const {validationResult}=require('express-validator');
 for(const [phone,valid] of [[undefined,false],['bad',false],['9876543210',true]]){
  const req={body:{role:'dealer',fullName:'Test Dealer',email:'dealer@example.com',password:'password123',businessName:'Test Bikes',phone}};
  for(const validator of registerValidators.filter(v=>v.run))await validator.run(req);
  const phoneErrors=validationResult(req).array().filter(e=>e.path==='phone');assert.equal(phoneErrors.length===0,valid);
 }
});
