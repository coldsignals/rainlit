package app.rainlit;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.audiofx.AcousticEchoCanceler;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.List;

/**
 * Where a call's sound comes out: the speaker, the earpiece (held to your ear like a phone
 * call), or a headset. Android keeps this choice for calls separately from music and videos.
 *
 * That's only true when the web page's call sound plays as a call, though. Android's WebView
 * does that only on phones with their own echo cancelling (and with echo cancelling on in
 * Rainlit); on the rest (many Xiaomi and MediaTek phones) it plays like music. Putting those
 * phones in call mode would point the volume buttons at the call volume, which the call's
 * sound doesn't follow. So there, the call stays out of call mode and gets a volume of its own
 * a different way: the media volume from before the call comes back when it ends, and the
 * next call starts at whatever the last one ended at.
 */
final class AudioRoute {

    interface Listener {
        void changed();
    }

    private AudioRoute() {}

    private static AudioDeviceCallback callback;
    // Whether this call's sound plays as a call (true) or like music (false).
    private static boolean callSound = true;

    private static String kind(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "earpiece";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "wired";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case 26 /* TYPE_BLE_HEADSET */: return "bluetooth";
            default: return null;
        }
    }

    /**
     * Call start: talking mode, and the speaker unless a headset is plugged in or connected.
     * {@code echo} is whether echo cancelling is on in Rainlit.
     */
    static void start(Context context, boolean echo, Listener listener) {
        AudioManager am = context.getSystemService(AudioManager.class);
        callSound = echo && AcousticEchoCanceler.isAvailable();
        if (callSound) {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            List<String> routes = available(context);
            if (!routes.contains("wired") && !routes.contains("bluetooth")) set(context, "speaker");
        } else {
            useCallVolume(context, am);
        }
        // (A page that started over brings a new listener: the old one's page is gone.)
        if (callback != null) am.unregisterAudioDeviceCallback(callback);
        callback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                listener.changed();
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
                listener.changed();
            }
        };
        am.registerAudioDeviceCallback(callback, new Handler(Looper.getMainLooper()));
    }

    static void stop(Context context) {
        AudioManager am = context.getSystemService(AudioManager.class);
        if (callback != null) {
            am.unregisterAudioDeviceCallback(callback);
            callback = null;
        }
        endCallVolume(context, am);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.clearCommunicationDevice();
        else am.setSpeakerphoneOn(false);
        am.setMode(AudioManager.MODE_NORMAL);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("rainlit.callvolume", Context.MODE_PRIVATE);
    }

    // Where music would come out right now. Each has its own media volume in Android.
    private static String mediaOutput(AudioManager am) {
        String out = "speaker";
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            String k = kind(d.getType());
            if ("wired".equals(k)) return k;
            if ("bluetooth".equals(k)) out = k;
        }
        return out;
    }

    // A call whose sound plays like music: remember the media volume, and go to the last call's.
    // (If one's already remembered, this call is still going: the page reloaded, or the app was
    // closed during it and never got to put the volume back.)
    private static void useCallVolume(Context context, AudioManager am) {
        SharedPreferences p = prefs(context);
        if (p.contains("normal")) return;
        String out = mediaOutput(am);
        int now = am.getStreamVolume(AudioManager.STREAM_MUSIC);
        p.edit().putInt("normal", now).putString("normalOn", out).apply();
        int call = p.getInt("call." + out, -1);
        if (call >= 0 && call != now) am.setStreamVolume(AudioManager.STREAM_MUSIC, call, 0);
    }

    // And when it ends: keep the call's volume for next time, and put the media volume back.
    private static void endCallVolume(Context context, AudioManager am) {
        SharedPreferences p = prefs(context);
        if (!p.contains("normal")) return;
        String out = mediaOutput(am);
        int call = am.getStreamVolume(AudioManager.STREAM_MUSIC);
        int normal = p.getInt("normal", call);
        boolean sameOutput = out.equals(p.getString("normalOn", out));
        p.edit().putInt("call." + out, call).remove("normal").remove("normalOn").apply();
        if (sameOutput && normal != call) am.setStreamVolume(AudioManager.STREAM_MUSIC, normal, 0);
    }

    /** Whether the phone has its own echo cancelling (which hears everything the phone plays). */
    static boolean phoneCancelsEcho() {
        return AcousticEchoCanceler.isAvailable();
    }

    static List<String> available(Context context) {
        AudioManager am = context.getSystemService(AudioManager.class);
        List<String> routes = new ArrayList<>();
        // Sound that plays like music goes wherever music does; there's no switching it.
        if (!callSound) {
            routes.add(mediaOutput(am));
            return routes;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                String k = kind(d.getType());
                if (k != null && !routes.contains(k)) routes.add(k);
            }
        } else {
            routes.add("speaker");
            routes.add("earpiece");
            if (am.isWiredHeadsetOn()) routes.add("wired");
        }
        return routes;
    }

    static String current(Context context) {
        AudioManager am = context.getSystemService(AudioManager.class);
        if (!callSound) return mediaOutput(am);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo d = am.getCommunicationDevice();
            String k = d != null ? kind(d.getType()) : null;
            return k != null ? k : "earpiece";
        }
        if (am.isSpeakerphoneOn()) return "speaker";
        return am.isWiredHeadsetOn() ? "wired" : "earpiece";
    }

    static boolean set(Context context, String route) {
        AudioManager am = context.getSystemService(AudioManager.class);
        if (!callSound) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                if (route.equals(kind(d.getType()))) return am.setCommunicationDevice(d);
            }
            return false;
        }
        am.setSpeakerphoneOn("speaker".equals(route));
        return true;
    }
}
