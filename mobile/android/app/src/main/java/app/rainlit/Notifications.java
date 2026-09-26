package app.rainlit;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;

/**
 * Rainlit's notifications. People can tune each kind in Android's settings.
 *
 * Calls and messages ring and chime through Android, for when Rainlit is closed and a push
 * note wakes it. While the app is open, Rainlit plays its own sounds, so the notifications
 * it posts then are silent.
 */
final class Notifications {

    // (Android fixes a channel's sound when it's made, so these got new names when Rainlit's
    // own sounds replaced the phone's defaults.)
    static final String CHANNEL_RING = "rainlit_calls";
    static final String CHANNEL_MESSAGE = "rainlit_messages";
    static final String CHANNEL_CALL = "call";

    private static final String PREFS = "notifications";

    private Notifications() {}

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);

        // Rainlit's own ringtone and chime (res/raw, made by mobile/make-sounds.js), the same
        // bells the app plays. People can pick another sound in Android's settings.
        NotificationChannel ring = new NotificationChannel(CHANNEL_RING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        ring.setDescription("When a friend calls you");
        ring.setSound(sound(context, R.raw.rainlit_ring), new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        ring.enableVibration(true);
        ring.setVibrationPattern(new long[] { 0, 600, 400, 600, 400, 600 });

        NotificationChannel message = new NotificationChannel(CHANNEL_MESSAGE, "Messages", NotificationManager.IMPORTANCE_HIGH);
        message.setDescription("New messages and missed calls");
        message.setSound(sound(context, R.raw.rainlit_chime), new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        message.enableVibration(true);

        NotificationChannel call = new NotificationChannel(CHANNEL_CALL, "Ongoing call", NotificationManager.IMPORTANCE_LOW);
        call.setDescription("Shown while you're in a call, so it keeps going in the background");

        manager.createNotificationChannel(ring);
        manager.createNotificationChannel(message);
        manager.createNotificationChannel(call);
        // Channels from earlier versions (always silent, then the phone's default sounds).
        for (String old : new String[] { "ring", "message", "calls", "messages" }) manager.deleteNotificationChannel(old);
    }

    static android.net.Uri sound(Context context, int rawId) {
        return android.net.Uri.parse(android.content.ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + rawId);
    }

    static PendingIntent openApp(Context context) {
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // One notification per friend for calls, and one per friend for messages.
    private static int ringId(String friendId) {
        return 1000 + (friendId.hashCode() & 0xffff);
    }

    private static int messageId(String friendId) {
        return 100_000 + (friendId.hashCode() & 0xffff);
    }

    private static final int IN_APP_RING = 3; // 1 is the ongoing call's notification
    private static final int IN_APP_MESSAGE = 4;

    /**
     * A call or message while Rainlit is running but you're not looking at it. With `sound`, the
     * phone rings or chimes (the app is in the background); without, it's silent because
     * Rainlit is playing its own.
     */
    static void showInApp(Context context, String title, String body, boolean ring, boolean sound) {
        NotificationCompat.Builder n = new NotificationCompat.Builder(context, ring ? CHANNEL_RING : CHANNEL_MESSAGE)
            .setSmallIcon(R.drawable.ic_stat_rainlit)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(openApp(context))
            .setAutoCancel(true)
            .setSilent(!sound)
            .setSound(sound(context, ring ? R.raw.rainlit_ring : R.raw.rainlit_chime)) // (Android 7; newer ones use the channel's)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(ring ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE);
        if (ring) n.setTimeoutAfter(60_000).setFullScreenIntent(openApp(context), true);
        post(context, ring ? IN_APP_RING : IN_APP_MESSAGE, n, ring && sound);
    }

    static void clearInAppRing(Context context) {
        NotificationManagerCompat.from(context).cancel(IN_APP_RING);
    }

    /** A push note arrived while Rainlit was closed (see lib/push.js on the server). */
    static void showPush(Context context, String json) {
        JSONObject note;
        try {
            note = new JSONObject(json);
        } catch (Exception e) {
            return;
        }
        JSONObject from = note.optJSONObject("from");
        String friendId = from != null ? from.optString("id", "") : "";
        String name = from != null ? from.optString("name", "A friend") : "A friend";
        switch (note.optString("type")) {
            case "ring": {
                NotificationCompat.Builder n = new NotificationCompat.Builder(context, CHANNEL_RING)
                    .setSmallIcon(R.drawable.ic_stat_rainlit)
                    .setContentTitle(name + " is calling")
                    .setContentText("Tap to answer in Rainlit")
                    .setSound(sound(context, R.raw.rainlit_ring))
                    .setContentIntent(openApp(context))
                    .setFullScreenIntent(openApp(context), true)
                    .setAutoCancel(true)
                    .setOngoing(true)
                    .setTimeoutAfter(60_000)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL);
                post(context, ringId(friendId), n, true);
                break;
            }
            case "ring-end": {
                NotificationManagerCompat.from(context).cancel(ringId(friendId));
                if (note.optBoolean("missed")) {
                    post(context, messageId(friendId) + 1, new NotificationCompat.Builder(context, CHANNEL_MESSAGE)
                        .setSmallIcon(R.drawable.ic_stat_rainlit)
                        .setContentTitle("Missed call from " + name)
                    .setSound(sound(context, R.raw.rainlit_chime))
                        .setContentIntent(openApp(context))
                        .setAutoCancel(true)
                        .setCategory(NotificationCompat.CATEGORY_MISSED_CALL));
                }
                break;
            }
            case "message": {
                SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                int count = prefs.getInt("unread:" + friendId, 0) + 1;
                prefs.edit().putInt("unread:" + friendId, count).apply();
                post(context, messageId(friendId), new NotificationCompat.Builder(context, CHANNEL_MESSAGE)
                    .setSmallIcon(R.drawable.ic_stat_rainlit)
                    .setContentTitle(name)
                    .setContentText(count == 1 ? "New message" : count + " new messages")
                    .setNumber(count)
                    .setSound(sound(context, R.raw.rainlit_chime))
                    .setContentIntent(openApp(context))
                    .setAutoCancel(true)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE));
                break;
            }
            default:
        }
    }

    /** Opening Rainlit clears what it had put up (but not the ongoing call's notification). */
    static void clearAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        for (String id : prefs.getStringSet("posted", new java.util.HashSet<>())) manager.cancel(Integer.parseInt(id));
        prefs.edit().clear().apply();
    }

    private static void post(Context context, int id, NotificationCompat.Builder n) {
        post(context, id, n, false);
    }

    /** `insistent`: the sound repeats until the notification goes away, like a phone ringing. */
    private static void post(Context context, int id, NotificationCompat.Builder n, boolean insistent) {
        try {
            android.app.Notification built = n.build();
            if (insistent) built.flags |= android.app.Notification.FLAG_INSISTENT;
            NotificationManagerCompat.from(context).notify(id, built);
        } catch (SecurityException e) {
            return; // notifications are turned off for Rainlit
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        java.util.Set<String> posted = new java.util.HashSet<>(prefs.getStringSet("posted", new java.util.HashSet<>()));
        posted.add(String.valueOf(id));
        prefs.edit().putStringSet("posted", posted).apply();
    }
}
