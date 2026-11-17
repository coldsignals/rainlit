package app.rainlit;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import org.json.JSONObject;

/**
 * A /tts message read aloud with Rainlit in the background or closed (2026-11-15: someone driving
 * won't have it open). The push note only says a /tts message came, and where (never its words:
 * the privacy policy promises a note never has your messages in it); this fetches the words from
 * Rainlit with your own sign-in, and says them in the phone's own voice, as directions are (other
 * sound dips under it, and a car takes it like a map app's voice). Only if you've said so in
 * Settings (RainlitPlugin.setTtsAway keeps that here).
 */
final class Speaker {
    private Speaker() {}

    private static final String PREFS = "tts";
    private static TextToSpeech tts = null;
    private static boolean ready = false;
    private static final ArrayDeque<String> waiting = new ArrayDeque<>();
    private static float volume = 1f;
    private static AudioFocusRequest focus = null;
    private static int speaking = 0;

    static void keep(Context context, boolean away, float vol) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("away", away).putFloat("volume", Math.max(0.1f, Math.min(1f, vol))).apply();
    }

    /** A push note: a /tts one, with reading them on, is fetched and read aloud. */
    static void fromPush(Context context, String json) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean("away", false)) return;
        String path;
        try {
            JSONObject t = new JSONObject(json).optJSONObject("tts");
            path = t != null ? t.optString("path", "") : "";
        } catch (Exception e) {
            return;
        }
        if (!path.startsWith("/api/")) return;
        String picked = ServerChoice.picked(context);
        String base = picked != null ? picked : ServerChoice.DEFAULT;
        String cookie;
        try {
            cookie = CookieManager.getInstance().getCookie(base);
        } catch (Exception e) {
            cookie = null;
        }
        if (cookie == null) return;
        final Context app = context.getApplicationContext();
        final float vol = p.getFloat("volume", 1f);
        final String url = base + path;
        final String withCookie = cookie;
        new Thread(() -> {
            String said = fetch(url, withCookie);
            if (said != null && !said.isEmpty()) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> say(app, said, vol));
            }
        }).start();
    }

    private static String fetch(String url, String cookie) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestProperty("Cookie", cookie);
            c.setRequestProperty("Accept", "application/json");
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 16_384) out.write(buf, 0, n);
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name())).optString("said", null);
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void say(Context context, String text, float vol) {
        volume = vol;
        if (tts == null) {
            waiting.add(text);
            tts = new TextToSpeech(context, (status) -> {
                ready = status == TextToSpeech.SUCCESS;
                if (!ready) {
                    waiting.clear();
                    tts = null;
                    return;
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onDone(String id) { finished(context); }
                    @Override public void onError(String id) { finished(context); }
                });
                while (!waiting.isEmpty()) speakNow(context, waiting.poll());
            });
        } else if (ready) {
            speakNow(context, text);
        } else {
            waiting.add(text);
        }
    }

    private static final AudioAttributes ATTRS = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();

    private static void speakNow(Context context, String text) {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (speaking++ == 0 && am != null) {
            // (Music and the rest dip under it, as they do for a map app's directions.)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(ATTRS).build();
                am.requestAudioFocus(focus);
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
        }
        tts.setAudioAttributes(ATTRS);
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
        tts.speak(text, TextToSpeech.QUEUE_ADD, params, "rainlit-away-" + System.nanoTime());
    }

    private static void finished(Context context) {
        if (--speaking > 0) return;
        speaking = 0;
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focus != null) am.abandonAudioFocusRequest(focus);
        } else {
            am.abandonAudioFocus(null);
        }
    }
}
