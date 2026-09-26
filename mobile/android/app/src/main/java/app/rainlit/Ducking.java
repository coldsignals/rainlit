package app.rainlit;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.List;

/**
 * During a call, other apps' music and videos play quieter, so they don't drown your friend
 * out (on many phones both share one volume). It's what a navigation app does when it speaks:
 * ask Android for the "audio focus" in a way that lets others keep playing, turned down.
 * An app that starts playing afterwards takes that back at full volume, so it's asked for
 * again a moment later, unless that app snatches it straight back again (it wants full
 * volume; let it be).
 */
final class Ducking {

    private Ducking() {}

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static AudioManager am;
    private static AudioFocusRequest request;
    private static AudioManager.AudioPlaybackCallback watcher;
    private static boolean on = false;
    private static boolean lost = false;
    private static boolean giveUp = false;
    private static boolean askedAgain = false;
    private static long askedAt = 0;
    // For Settings: "off", "on" (others are turned down), "denied" (Android said no),
    // "taken" (another app took it; asking again), "gave-up" (it keeps taking it back).
    private static String state = "off";

    private static final Runnable ASK_AGAIN = () -> {
        if (on && lost && !giveUp) {
            askedAgain = true;
            ask();
        }
    };

    private static final AudioManager.OnAudioFocusChangeListener LISTENER = (change) -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS) {
            // (A phone call takes it only for a while, as AUDIOFOCUS_LOSS_TRANSIENT, and gives it back.)
            lost = true;
            if (askedAgain && SystemClock.elapsedRealtime() - askedAt < 10_000) {
                giveUp = true;
                state = "gave-up";
            } else {
                state = "taken";
                MAIN.removeCallbacks(ASK_AGAIN);
                MAIN.postDelayed(ASK_AGAIN, 1500); // once it's playing, so it gets turned down
            }
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            lost = false;
            if (on) state = "on";
        }
    };

    static void start(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return; // (Android 7: left as it is)
        am = context.getSystemService(AudioManager.class);
        if (request == null) {
            request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build())
                .setOnAudioFocusChangeListener(LISTENER, MAIN)
                .build();
        }
        on = true;
        lost = false;
        giveUp = false;
        askedAgain = false;
        ask();
        if (watcher == null) {
            watcher = new AudioManager.AudioPlaybackCallback() {
                @Override
                public void onPlaybackConfigChanged(List<AudioPlaybackConfiguration> configs) {
                    if (on && lost && !giveUp) {
                        MAIN.removeCallbacks(ASK_AGAIN);
                        MAIN.postDelayed(ASK_AGAIN, 500);
                    }
                }
            };
            am.registerAudioPlaybackCallback(watcher, MAIN);
        }
    }

    private static void ask() {
        askedAt = SystemClock.elapsedRealtime();
        lost = am.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        state = lost ? "denied" : "on";
    }

    static String state() {
        return state;
    }

    static void stop(Context context) {
        on = false;
        state = "off";
        MAIN.removeCallbacks(ASK_AGAIN);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        AudioManager manager = context.getSystemService(AudioManager.class);
        if (request != null) manager.abandonAudioFocusRequest(request);
        if (watcher != null) {
            manager.unregisterAudioPlaybackCallback(watcher);
            watcher = null;
        }
    }
}
