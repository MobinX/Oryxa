package com.example.flutter_remote_dev

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
        ensureFirebaseInitialized()
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "high_importance_channel"
            val name = "Order & Customer Alerts"
            val descriptionText = "Notifications for new customer orders, urgent help requests, and sales updates."
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(channelId, name, importance).apply {
                description = descriptionText
                enableVibration(true)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }

    private fun ensureFirebaseInitialized() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                val options = FirebaseOptions.Builder()
                    .setApiKey("AIzaSyB0jHaD6MIrfKkpGE8ZWLg7xxcXoiuA7Ck")
                    .setApplicationId("1:208924881683:android:b3dbcaab831f4576e7a0e6")
                    .setProjectId("oryza-33d8f")
                    .setGcmSenderId("208924881683")
                    .setStorageBucket("oryza-33d8f.firebasestorage.app")
                    .build()
                FirebaseApp.initializeApp(this, options)
                Log.i("MainApplication", "Native FirebaseApp initialized successfully")
            }
        } catch (e: Exception) {
            Log.e("MainApplication", "Native FirebaseApp init error: ${e.message}")
        }
    }
}
