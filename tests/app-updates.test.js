const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateRelease,newer}=require('../app-updates');
const release={versionCode:6,versionName:'1.5-test',downloadUrl:'https://auction.bikeskart.com/downloads/BikesKart-Auction-v1.5.apk'};
test('only newer versions prompt; equal or newer installs are not downgraded',()=>{assert.equal(newer(release,{versionCode:5}),true);assert.equal(newer(release,{versionCode:6}),false);assert.equal(newer(release,{versionCode:7}),false);assert.equal(newer(release,null),false);});
test('update link must be a trusted HTTPS APK with a valid version',()=>{assert.equal(validateRelease(release),release);for(const downloadUrl of ['http://auction.bikeskart.com/downloads/BikesKart-Auction-v1.5.apk','https://evil.com/downloads/BikesKart-Auction-v1.5.apk','https://auction.bikeskart.com/admin','https://auction.bikeskart.com/downloads/BikesKart-Auction-v1.5.apk?redirect=evil'])assert.throws(()=>validateRelease({...release,downloadUrl}));for(const versionCode of [0,'6',NaN])assert.throws(()=>validateRelease({...release,versionCode}));});
