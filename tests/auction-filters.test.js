const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auctionFilters}=require('../src/utils/auctionFilters');
test('personal filters use the authenticated viewer and search stays parameterized',()=>{
 const f=auctionFilters({id:7},{phase:'mybids',search:"' OR 1=1 --",maxPrice:'50000'});
 assert.equal(f.params[0],7);assert.ok(!f.where.includes('OR 1=1'));assert.equal(f.params[4],50000);
 assert.deepEqual(auctionFilters({id:9},{phase:'wins'}).params,[9]);
});
test('invalid filters are rejected',()=>{assert.throws(()=>auctionFilters({id:1},{phase:'other'}));assert.throws(()=>auctionFilters({id:1},{maxPrice:'-1'}));});
