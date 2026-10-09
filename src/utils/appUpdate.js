function appUpdate(env=process.env) {
  let download;
  try { download=new URL(env.APP_UPDATE_APK_URL); } catch { return {available:false}; }
  if(download.protocol!=='https:'||download.username||download.password)return {available:false};
  const versionCode=Number(env.APP_UPDATE_VERSION_CODE);
  if(!Number.isSafeInteger(versionCode)||versionCode<=0)return {available:false};
  return {available:true,versionCode,versionName:String(env.APP_UPDATE_VERSION_NAME||versionCode).slice(0,50),downloadUrl:download.href};
}
module.exports={appUpdate};
