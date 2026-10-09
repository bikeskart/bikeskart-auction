const {test}=require('node:test');
const assert=require('node:assert/strict');
const {appUpdate}=require('../src/utils/appUpdate');
test('app update is unavailable until a real HTTPS download and version are configured',()=>{
 for(const config of [{},{APP_UPDATE_APK_URL:'javascript:alert(1)',APP_UPDATE_VERSION_CODE:'5'},{APP_UPDATE_APK_URL:'http://example.com/app.apk',APP_UPDATE_VERSION_CODE:'5'},{APP_UPDATE_APK_URL:'https://secret@example.com/app.apk',APP_UPDATE_VERSION_CODE:'5'},{APP_UPDATE_APK_URL:'https://example.com/app.apk',APP_UPDATE_VERSION_CODE:'x'}])assert.deepEqual(appUpdate(config),{available:false});
});
test('app update returns the configured latest version and direct download',()=>{
 assert.deepEqual(appUpdate({APP_UPDATE_APK_URL:'https://example.com/app.apk',APP_UPDATE_VERSION_CODE:'5',APP_UPDATE_VERSION_NAME:'1.4'}),{available:true,downloadUrl:'https://example.com/app.apk',versionCode:5,versionName:'1.4'});
});
