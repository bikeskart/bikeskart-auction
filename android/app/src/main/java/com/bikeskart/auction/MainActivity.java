package com.bikeskart.auction;
import android.app.Activity;
import android.os.Bundle;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.view.*;
import android.widget.*;
public class MainActivity extends Activity {
 private WebView web; private ProgressBar progress; private ValueCallback<Uri[]> files;
 private boolean internal(Uri uri) { return "https".equals(uri.getScheme()) && "auction.bikeskart.com".equals(uri.getHost()); }
 private boolean navigate(Uri uri) { if(internal(uri)&&!(uri.getPath()!=null&&uri.getPath().toLowerCase(java.util.Locale.ROOT).endsWith(".apk"))) return false; String s=uri.getScheme(); if("https".equals(s)||"http".equals(s)||"tel".equals(s)||"mailto".equals(s)) { try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); } catch(Exception e) { Toast.makeText(this,"No app available to open this link",Toast.LENGTH_SHORT).show(); } } return true; }
 private String targetUrl(){String id=getIntent().getStringExtra("auctionId");return id!=null&&id.matches("[1-9][0-9]{0,14}")?"https://auction.bikeskart.com/?auction="+id:"https://auction.bikeskart.com";}
 private void publishToken(String token){if(web==null||web.getUrl()==null||!internal(Uri.parse(web.getUrl())))return;boolean allowed=android.os.Build.VERSION.SDK_INT<24||getSystemService(android.app.NotificationManager.class).areNotificationsEnabled();String value=token!=null?JSONObject.quote(token):"null";web.evaluateJavascript("window.BKPushDevice={versionCode:"+BuildConfig.VERSION_CODE+",versionName:"+JSONObject.quote(BuildConfig.VERSION_NAME)+",token:"+value+",enabled:"+allowed+"};window.dispatchEvent(new CustomEvent('bk-push-token',{detail:window.BKPushDevice}));",null);}
 private void syncPush(){FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{if(task.isSuccessful()){getSharedPreferences("push",MODE_PRIVATE).edit().putString("token",task.getResult()).apply();publishToken(task.getResult());}});}
 protected void onResume(){super.onResume();syncPush();}
 protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);web.loadUrl(targetUrl());}
 public void onCreate(Bundle state) { super.onCreate(state);
 LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(0xffffffff); setContentView(root);
 if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED&&!getSharedPreferences("push",MODE_PRIVATE).getBoolean("asked",false)){getSharedPreferences("push",MODE_PRIVATE).edit().putBoolean("asked",true).apply();requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},8);}
 if(android.os.Build.VERSION.SDK_INT>=30) root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener(){public WindowInsets onApplyWindowInsets(View v,WindowInsets i){android.graphics.Insets b=i.getInsets(WindowInsets.Type.systemBars()); v.setPadding(b.left,b.top,b.right,b.bottom); return i;}}); else root.setFitsSystemWindows(true);
 progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal); root.addView(progress,new LinearLayout.LayoutParams(-1,6));
 web=new WebView(this); root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
 web.setDownloadListener((url,userAgent,contentDisposition,mimetype,contentLength)->{Uri uri=Uri.parse(url);if("https".equals(uri.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){Toast.makeText(this,"Open the update link in your browser to download",Toast.LENGTH_LONG).show();}}});
 WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
 web.setWebViewClient(new WebViewClient(){
 public void onPageFinished(WebView v,String url){syncPush();}
 public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return navigate(r.getUrl());}
 public boolean shouldOverrideUrlLoading(WebView v,String u){return navigate(Uri.parse(u));}
 public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame()){Toast.makeText(MainActivity.this,"Connection failed. Check your internet and reopen the app.",Toast.LENGTH_LONG).show();}}
 });
 web.setWebChromeClient(new WebChromeClient(){ public void onProgressChanged(WebView v,int n){progress.setProgress(n);progress.setVisibility(n==100?View.GONE:View.VISIBLE);}
 public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> c,FileChooserParams p){if(files!=null)files.onReceiveValue(null); files=c; try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,p.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);startActivityForResult(i,7);return true;}catch(Exception e){files=null;return false;}}
 });
 if(state==null || web.restoreState(state)==null)web.loadUrl(targetUrl());
 }
 public void onRequestPermissionsResult(int r,String[] p,int[] g){super.onRequestPermissionsResult(r,p,g);if(r==8)syncPush();}
 protected void onActivityResult(int r,int c,Intent i){super.onActivityResult(r,c,i);if(r==7&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(c,i));files=null;}}
 protected void onSaveInstanceState(Bundle b){web.saveState(b);super.onSaveInstanceState(b);}
 public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 protected void onDestroy(){if(files!=null)files.onReceiveValue(null);web.destroy();super.onDestroy();}
}
