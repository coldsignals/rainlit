package app.rainlit;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

/**
 * Receives push notes through UnifiedPush: a push app on the phone (ntfy, for example)
 * keeps one connection open for all the apps that use it, and wakes Rainlit when the
 * server has something for it, even while Rainlit is closed.
 */
public class PushServiceImpl extends PushService {

    private static final String PREFS = "push";

    @Override
    public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        SharedPreferences.Editor e = getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("url", endpoint.getUrl());
        if (endpoint.getPubKeySet() != null) {
            e.putString("p256dh", endpoint.getPubKeySet().getPubKey()).putString("auth", endpoint.getPubKeySet().getAuth());
        }
        e.apply();
        RainlitPlugin.pushChanged(); // the page sends the new address to the server
    }

    @Override
    public void onMessage(PushMessage message, String instance) {
        // A note only matters if you're not looking at Rainlit; if you are, it already knows.
        if (RainlitPlugin.appVisible) return;
        Notifications.showPush(this, new String(message.getContent(), StandardCharsets.UTF_8));
    }

    @Override
    public void onRegistrationFailed(FailedReason reason, String instance) {
        forget(this);
        RainlitPlugin.pushChanged();
    }

    @Override
    public void onUnregistered(String instance) {
        forget(this);
        RainlitPlugin.pushChanged();
    }

    static void forget(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    /** The current push address, or null. */
    static String[] endpoint(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String url = p.getString("url", null);
        String p256dh = p.getString("p256dh", null);
        String auth = p.getString("auth", null);
        return url != null && p256dh != null && auth != null ? new String[] { url, p256dh, auth } : null;
    }
}
