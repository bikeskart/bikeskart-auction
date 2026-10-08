package com.bikeskart.auction;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.messaging.*;
public class AuctionMessagingService extends FirebaseMessagingService {
 public void onNewToken(String token){getSharedPreferences("push",MODE_PRIVATE).edit().putString("token",token).apply();}
 public void onMessageReceived(RemoteMessage message){
  if(Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)return;
  String id=message.getData().get("auctionId"),title=message.getData().get("title"),body=message.getData().get("body");
  if(title==null && message.getNotification()!=null)title=message.getNotification().getTitle();
  if(body==null && message.getNotification()!=null)body=message.getNotification().getBody();
  if(title==null)title="BikesKart Auction";if(body==null)body="A new auction is live. Tap to view.";
  Intent i=new Intent(this,MainActivity.class);i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
  if(id!=null && id.matches("[1-9][0-9]{0,14}"))i.putExtra("auctionId",id);
  int n=id==null?title.hashCode():id.hashCode();PendingIntent tap=PendingIntent.getActivity(this,n,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"auction_live"):new Notification.Builder(this);
  b.setSmallIcon(R.drawable.notification_icon).setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(tap).setAutoCancel(true);
  if(Build.VERSION.SDK_INT<26)b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
  getSystemService(NotificationManager.class).notify(n,b.build());
 }
}
