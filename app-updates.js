(function(root){
  'use strict';
  function validateRelease(data){
    if(!data || !Number.isSafeInteger(data.versionCode) || data.versionCode<1 || typeof data.versionName!=='string' || !data.versionName.trim()) throw Error('Invalid app update information.');
    const url=new URL(data.downloadUrl);
    if(url.origin!=='https://auction.bikeskart.com' || url.username || url.password || !/^\/downloads\/BikesKart-Auction-v[0-9.]+\.apk$/.test(url.pathname) || url.search || url.hash) throw Error('Invalid app download link.');
    return data;
  }
  function newer(release,installed){return Number.isSafeInteger(installed?.versionCode) && release.versionCode>installed.versionCode;}
  if(typeof module==='object'&&module.exports)module.exports={validateRelease,newer};
  if(typeof document==='undefined')return;
  let release=null,loading=null;
  const button=document.getElementById('appUpdateMenu');if(!button)return;
  const dialog=document.createElement('dialog');dialog.className='app-update-dialog';
  dialog.innerHTML='<h2>App updates</h2><p data-update-message role="status"></p><div class="app-update-actions"><a data-update-download hidden>Download update</a><button type="button" data-update-close>Close</button></div>';
  document.body.append(dialog);
  const message=dialog.querySelector('[data-update-message]'),download=dialog.querySelector('[data-update-download]');
  dialog.querySelector('[data-update-close]').onclick=()=>dialog.close();
  async function fetchRelease(){if(!loading)loading=fetch('/api/app/android-release',{cache:'no-store',credentials:'omit'}).then(async res=>{const data=await res.json();if(!res.ok)throw Error(data.error||'Could not check for updates.');return validateRelease(data);}).finally(()=>loading=null);return loading;}
  function setMenu(){button.textContent=release&&newer(release,root.BKAppVersion)?'Update available · '+release.versionName:'Check for app updates';}
  async function check(show){
    if(show){document.getElementById('accountMenu')?.removeAttribute('open');if(!dialog.open)dialog.showModal();message.textContent='Checking for updates…';download.hidden=true;}
    try{release=await fetchRelease();setMenu();if(!show)return;
      const installed=root.BKAppVersion;
      if(Number.isSafeInteger(installed?.versionCode)&&!newer(release,installed)){message.textContent='Your app is up to date ('+installed.versionName+').';return;}
      message.textContent=(installed?'Update available: ':'Latest Android app: ')+release.versionName+'. Download the APK, open it and approve Install / Update. Keep your current app installed.';
      download.href=release.downloadUrl;download.textContent='Download '+release.versionName;download.hidden=false;
    }catch(err){if(show)message.textContent=err.message||'Could not check for updates. Please try again.';}
  }
  button.onclick=()=>check(true);
  root.addEventListener('bk-app-version',()=>check(false));
  if(root.BKAppVersion)check(false);
})(typeof window==='undefined'?globalThis:window);
