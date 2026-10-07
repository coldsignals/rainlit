package app.rainlit;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps a call going while Rainlit is in the background or the screen is off. Android
 * only lets an app keep using the microphone out of sight if it shows an ongoing
 * notification, so this is that notification ("In a call with Alex"), plus locks that
 * stop the phone from sleeping the CPU and Wi-Fi mid-call.
 */
public class CallService extends Service {

    static final int NOTIFICATION_ID = 1;
    static final String EXTRA_NAME = "name";

    // Whether a call is going (the page asks, when it starts over during one).
    static volatile boolean running = false;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String name = intent != null ? intent.getStringExtra(EXTRA_NAME) : null;
        String text = name != null && !name.isEmpty() ? "In a call with " + name : "In a call";

        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, Notifications.CHANNEL_CALL)
            .setSmallIcon(R.drawable.ic_stat_rainlit)
            .setContentTitle(text)
            .setContentText("Tap to go back to the call")
            .setContentIntent(tap)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();

        // Already going (the page started over and joined the call again): just update the
        // notification. Starting it again with the phone locked isn't allowed, and would stop it.
        if (running) {
            getSystemService(android.app.NotificationManager.class).notify(NOTIFICATION_ID, notification);
            return START_NOT_STICKY;
        }

        try {
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
            running = true;
        } catch (RuntimeException e) {
            // No microphone permission (the call is listen-only): nothing to keep alive.
            stopSelf();
            return START_NOT_STICKY;
        }

        if (wakeLock == null) {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rainlit:call");
            wakeLock.acquire(48 * 60 * 60 * 1000L); // let go after two days, just in case (calls can go on all night, and the next day)
        }
        if (wifiLock == null) {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wifi.createWifiLock(mode, "rainlit:call");
            wifiLock.acquire();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
