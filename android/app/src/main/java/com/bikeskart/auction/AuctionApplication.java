package com.bikeskart.auction;
import android.app.*;
import android.os.Build;
public class AuctionApplication extends Application {
 public void onCreate(){super.onCreate(); if(Build.VERSION.SDK_INT>=26){NotificationChannel c=new NotificationChannel("auction_live","Live auctions",NotificationManager.IMPORTANCE_HIGH);c.setDescription("Alerts when BikesKart auctions go live");getSystemService(NotificationManager.class).createNotificationChannel(c);}}
}
