const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseProfile,readProfile,ensureBikeProfile}=require('../src/utils/bikeProfile');
test('vehicle and inspection fields preserve explicit No, zero keys and ratings',()=>{
 const p=parseProfile({registrationYear:'2024',hpStatus:'No',rcAvailable:'Yes',keysCount:'0',engineCondition:'Good',vehicleRating:'5',smoke:'No'});
 assert.equal(p.keysCount,0);assert.equal(p.smoke,'No');assert.equal(p.vehicleRating,5);assert.deepEqual(readProfile(JSON.stringify(p)),p);
});
test('partial updates preserve recorded fields; blank explicitly clears a field',()=>{
 assert.deepEqual(parseProfile({smoke:''},{keysCount:0,smoke:'No'}),{keysCount:0,smoke:null});assert.deepEqual(readProfile('broken'),{});
});
test('invalid inspection values and numeric ranges are rejected',()=>{
 for(const body of [{vehicleRating:6},{vehicleRating:1.5},{keysCount:-1},{registrationYear:1900},{smoke:'Maybe'},{engineCondition:'excellent'},{keysCount:[]}])assert.throws(()=>parseProfile(body));
});
test('bike profile storage is additive and provisioned once',async()=>{
 const calls=[];const pool={query:async sql=>{calls.push(sql);return [[]];}};await Promise.all([ensureBikeProfile(pool),ensureBikeProfile(pool)]);assert.deepEqual(calls,['SHOW COLUMNS FROM bikes','ALTER TABLE bikes ADD COLUMN detail_profile LONGTEXT NULL']);
});
