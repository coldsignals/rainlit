package app.rainlit;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.ComponentCallbacks2;
import android.content.res.Configuration;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import static org.unifiedpush.android.connector.ConstantsKt.INSTANCE_DEFAULT;

import org.unifiedpush.android.connector.UnifiedPush;

/**
 * What the Rainlit page can ask of the Android app (public/app.js looks for it as
 * Capacitor's "Rainlit" plugin): keep a call alive in the background, show notifications
 * while you're not looking at the app, and set up push for when it's closed.
 */
@CapacitorPlugin(name = "Rainlit")
public class RainlitPlugin extends Plugin {

    static volatile boolean appVisible = false;
    private static RainlitPlugin current;

    @Override
    public void load() {
        current = this;
        Notifications.createChannels(getContext());
        getContext().registerComponentCallbacks(memoryWatch);
    }

    // Android saying it's short of memory (and how short), passed on to the page: for the call
    // debug log, to see whether it warned before it closed the app.
    private final ComponentCallbacks2 memoryWatch = new ComponentCallbacks2() {
        @Override
        public void onTrimMemory(int level) {
            JSObject data = new JSObject();
            data.put("level", level);
            notifyListeners("memory", data);
        }

        @Override
        public void onLowMemory() {
            onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE);
        }

        @Override
        public void onConfigurationChanged(Configuration config) {}
    };

    @Override
    protected void handleOnResume() {
        appVisible = true;
        Notifications.clearAll(getContext());
        tellVisibility(true);
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
        tellVisibility(false);
    }

    // The page keeps quiet in the background (the phone's notifications make the sounds then).
    private void tellVisibility(boolean visible) {
        JSObject data = new JSObject();
        data.put("visible", visible);
        notifyListeners("visibility", data);
    }

    // ----- Calls -----

    @PluginMethod
    public void callStarted(PluginCall call) {
        Intent intent = new Intent(getContext(), CallService.class).putExtra(CallService.EXTRA_NAME, call.getString("name", ""));
        try {
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (RuntimeException e) {
            // Android refused (for example the app wasn't on screen); the call still works while it is.
        }
        AudioRoute.start(getContext(), call.getBoolean("echo", true), () -> notifyListeners("audioroutes", routes()));
        keepPageAwake(true);
        if (call.getBoolean("duck", true)) Ducking.start(getContext());
        onPhone = false;
        handler.removeCallbacks(watchPhone);
        handler.post(watchPhone);
        call.resolve(routes());
    }

    // An ordinary phone call during a Rainlit call: the page puts the Rainlit call on hold, so
    // the person on the phone doesn't hear your friend (and your friend doesn't hear the phone
    // call). Android's audio mode says when there's one, with no extra permission needed.
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean onPhone = false;
    private final Runnable watchPhone = new Runnable() {
        @Override
        public void run() {
            int mode = getContext().getSystemService(AudioManager.class).getMode();
            boolean now = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_CALL_SCREENING;
            if (now != onPhone) {
                onPhone = now;
                JSObject data = new JSObject();
                data.put("on", now);
                notifyListeners("phonecall", data);
            }
            handler.postDelayed(this, 1000);
        }
    };

    // Android lets an app's web page be frozen or stopped once it's off screen, and some phones
    // do that even during a call, which breaks it. During a call, the page keeps full priority,
    // and its engine keeps thinking it's on screen, so it doesn't freeze it (see RainlitWebView).
    private void keepPageAwake(boolean awake) {
        if (getBridge() == null) return;
        getBridge().executeOnMainThread(() -> {
            android.webkit.WebView view = getBridge().getWebView();
            if (view == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                view.setRendererPriorityPolicy(android.webkit.WebView.RENDERER_PRIORITY_IMPORTANT, !awake);
            }
            if (view instanceof RainlitWebView) ((RainlitWebView) view).setStayAwake(awake);
        });
    }

    @PluginMethod
    public void callEnded(PluginCall call) {
        getContext().stopService(new Intent(getContext(), CallService.class));
        handler.removeCallbacks(watchPhone);
        onPhone = false;
        Ducking.stop(getContext());
        AudioRoute.stop(getContext());
        keepPageAwake(false);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        handler.removeCallbacks(watchPhone); // (this page is gone; a new one takes over)
        getContext().unregisterComponentCallbacks(memoryWatch);
    }

    /** Other apps' sound turned down during the call, or not (a setting). */
    @PluginMethod
    public void setDucking(PluginCall call) {
        if (call.getBoolean("on", true)) Ducking.start(getContext());
        else Ducking.stop(getContext());
        call.resolve();
    }

    /** Whether other apps are turned down right now (shown in Settings, during a call). */
    @PluginMethod
    public void duckStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", Ducking.state());
        call.resolve(result);
    }

    /**
     * Which version of the app this is (shown in Settings), and whether Google Play installed it:
     * then Play keeps it up to date, and the page doesn't offer newer versions itself (Play's
     * rules don't allow an app from Play to update itself any other way).
     */
    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            result.put("version", info.versionName);
        } catch (PackageManager.NameNotFoundException ignored) {}
        result.put("store", "com.android.vending".equals(installer(getContext())) ? "play" : "");
        call.resolve(result);
    }

    /** Which app installed this one (the Play Store, a browser, Obtainium...), or null. */
    @SuppressWarnings("deprecation")
    private static String installer(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                return pm.getInstallSourceInfo(context.getPackageName()).getInstallingPackageName();
            }
            return pm.getInstallerPackageName(context.getPackageName());
        } catch (Exception e) {
            return null;
        }
    }

    // ----- Another Rainlit server -----

    @PluginMethod
    public void getServer(PluginCall call) {
        String picked = ServerChoice.picked(getContext());
        JSObject result = new JSObject();
        result.put("url", picked != null ? picked : ServerChoice.DEFAULT);
        result.put("custom", picked != null);
        call.resolve(result);
    }

    /** Is there a Rainlit server at this address? Resolves with { url, name }. */
    @PluginMethod
    public void checkServer(PluginCall call) {
        String url = ServerChoice.clean(call.getString("url"));
        if (url == null) {
            call.reject("That doesn't look like a web address. Rainlit servers use https://.");
            return;
        }
        new Thread(() -> {
            try {
                call.resolve(JSObject.fromJSONObject(ServerChoice.check(url)));
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }

    /** Checks the server, remembers it, and starts the app again on it. */
    @PluginMethod
    public void setServer(PluginCall call) {
        String url = ServerChoice.clean(call.getString("url"));
        if (url == null) {
            call.reject("That doesn't look like a web address. Rainlit servers use https://.");
            return;
        }
        new Thread(() -> {
            try {
                JSObject found = JSObject.fromJSONObject(ServerChoice.check(url));
                ServerChoice.pick(getContext(), found.getString("url"));
                call.resolve(found);
                startOver();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void resetServer(PluginCall call) {
        ServerChoice.pick(getContext(), null);
        call.resolve();
        startOver();
    }

    // The "can't reach it" page's way back to rainlit.app: a rainlit://use-rainlit-app link (that
    // page is the app's own, and can't call into the app the way Rainlit's pages can).
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if ("rainlit".equals(url.getScheme()) && "use-rainlit-app".equals(url.getHost())) {
            ServerChoice.pick(getContext(), null);
            startOver();
            return true;
        }
        return null;
    }

    private void startOver() {
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(activity::recreate);
    }

    // ----- Starting over -----

    private static SharedPreferences restarts(Context context) {
        return context.getSharedPreferences("rainlit.restarts", Context.MODE_PRIVATE);
    }

    /** The page's engine stopped and the app's screen is starting over (see MainActivity). */
    static void recordRestart(Context context, String why) {
        SharedPreferences p = restarts(context);
        long now = System.currentTimeMillis();
        StringBuilder recent = new StringBuilder(String.valueOf(now));
        for (String t : p.getString("times", "").split(",")) {
            try {
                if (now - Long.parseLong(t) < 30 * 60_000L) recent.append(',').append(t);
            } catch (NumberFormatException ignored) {}
        }
        p.edit().putString("times", recent.toString()).putString("why", why).putLong("at", now).apply();
    }

    /**
     * For a page that's just loaded: is a call going (so it should join again), did the app's
     * screen just start over (and why), and did Android close the whole app recently.
     */
    @PluginMethod
    public void callStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("inCall", CallService.running);
        SharedPreferences p = restarts(getContext());
        long now = System.currentTimeMillis();
        if (p.contains("why") && now - p.getLong("at", 0) < 10 * 60_000L) result.put("restarted", p.getString("why", ""));
        int recent = 0;
        for (String t : p.getString("times", "").split(",")) {
            try {
                if (now - Long.parseLong(t) < 30 * 60_000L) recent++;
            } catch (NumberFormatException ignored) {}
        }
        result.put("restarts", recent);
        p.edit().remove("why").apply();
        // Android keeps a note of how the app last ended. Anything but a normal close in the
        // last few hours (and not reported before) is passed on.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                ActivityManager am = getContext().getSystemService(ActivityManager.class);
                java.util.List<ApplicationExitInfo> exits = am.getHistoricalProcessExitReasons(getContext().getPackageName(), 0, 1);
                if (!exits.isEmpty()) {
                    ApplicationExitInfo e = exits.get(0);
                    int r = e.getReason();
                    boolean abnormal = r == ApplicationExitInfo.REASON_SIGNALED || r == ApplicationExitInfo.REASON_LOW_MEMORY
                        || r == ApplicationExitInfo.REASON_CRASH || r == ApplicationExitInfo.REASON_CRASH_NATIVE
                        || r == ApplicationExitInfo.REASON_ANR || r == ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE
                        || r == ApplicationExitInfo.REASON_OTHER || r == 14 /* REASON_FREEZER */;
                    if (abnormal && now - e.getTimestamp() < 3 * 3600_000L && e.getTimestamp() > p.getLong("exitSeen", 0)) {
                        p.edit().putLong("exitSeen", e.getTimestamp()).apply();
                        JSObject exit = new JSObject();
                        exit.put("reason", r);
                        exit.put("text", e.getDescription() != null ? e.getDescription() : "");
                        exit.put("at", e.getTimestamp());
                        // How much memory it was using (kB), and how important Android thought it
                        // was then (100: on screen; 125: in the background with a call going).
                        exit.put("pss", e.getPss());
                        exit.put("rss", e.getRss());
                        exit.put("importance", e.getImportance());
                        result.put("lastExit", exit);
                    }
                }
            } catch (RuntimeException ignored) {}
        }
        call.resolve(result);
    }

    // ----- Speaker, earpiece or headset -----

    private JSObject routes() {
        JSObject result = new JSObject();
        result.put("current", AudioRoute.current(getContext()));
        result.put("available", new JSArray(AudioRoute.available(getContext())));
        result.put("phoneCancelsEcho", AudioRoute.phoneCancelsEcho());
        return result;
    }

    @PluginMethod
    public void audioRoutes(PluginCall call) {
        call.resolve(routes());
    }

    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        AudioRoute.set(getContext(), call.getString("route", "speaker"));
        call.resolve(routes());
    }

    // ----- Saving and opening files -----

    /** Download a file from a chat (or a GIF) to Downloads/Rainlit. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("Can't download that");
            return;
        }
        Saving.download(getContext(), url, call.getString("name", ""), call.getString("type", ""));
        call.resolve();
    }

    /** Save a file the page already holds (sent straight through a call), given as base64. */
    @PluginMethod
    public void saveData(PluginCall call) {
        try {
            byte[] data = android.util.Base64.decode(call.getString("data", ""), android.util.Base64.DEFAULT);
            Saving.saveBytes(getContext(), data, call.getString("name", ""), call.getString("type", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't save it");
        }
    }

    /** Open a web address in the phone's browser. */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("Can't open that");
            return;
        }
        Intent view = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(view);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("No browser found");
        }
    }

    // ----- Notifications while the app is running -----

    @PluginMethod
    public void notify(PluginCall call) {
        JSObject result = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean show = !appVisible && allowed;
        if (show) {
            Notifications.showInApp(getContext(), call.getString("title", "Rainlit"), call.getString("body", ""),
                Boolean.TRUE.equals(call.getBoolean("call", false)), Boolean.TRUE.equals(call.getBoolean("sound", false)));
        }
        result.put("shown", show);
        call.resolve(result);
    }

    /** Stop the ringing notification (the call was answered, declined or given up on). */
    @PluginMethod
    public void clearRing(PluginCall call) {
        Notifications.clearInAppRing(getContext());
        call.resolve();
    }

    // ----- Push, for when the app is closed (UnifiedPush) -----

    /** Which push apps are installed, which one Rainlit uses, and its current address. */
    @PluginMethod
    public void pushStatus(PluginCall call) {
        call.resolve(status(getContext()));
    }

    /** Start using the phone's push app (asks which one if there are several). */
    @PluginMethod
    public void pushEnable(PluginCall call) {
        String vapid = call.getString("vapid");
        Activity activity = getActivity();
        if (activity == null || vapid == null) {
            call.reject("Not ready");
            return;
        }
        UnifiedPush.tryUseCurrentOrDefaultDistributor(activity, (found) -> {
            boolean ok = Boolean.TRUE.equals(found);
            if (ok) {
                try {
                    UnifiedPush.register(getContext(), INSTANCE_DEFAULT, "Rainlit", vapid);
                } catch (RuntimeException e) {
                    ok = false; // for example, the server's key wasn't in the expected form
                }
            }
            JSObject result = new JSObject();
            result.put("ok", ok);
            call.resolve(result);
            return kotlin.Unit.INSTANCE;
        });
    }

    @PluginMethod
    public void pushDisable(PluginCall call) {
        UnifiedPush.unregister(getContext(), INSTANCE_DEFAULT);
        PushServiceImpl.forget(getContext());
        call.resolve();
    }

    static void pushChanged() {
        RainlitPlugin plugin = current;
        if (plugin != null) plugin.notifyListeners("push", status(plugin.getContext()));
    }

    private static JSObject status(Context context) {
        JSObject result = new JSObject();
        JSArray apps = new JSArray();
        PackageManager pm = context.getPackageManager();
        for (String pkg : UnifiedPush.getDistributors(context)) {
            if (pkg.equals(context.getPackageName())) continue;
            JSObject app = new JSObject();
            app.put("id", pkg);
            try {
                ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
                app.put("name", pm.getApplicationLabel(info).toString());
            } catch (PackageManager.NameNotFoundException e) {
                app.put("name", pkg);
            }
            apps.put(app);
        }
        result.put("apps", apps);
        String using = UnifiedPush.getAckDistributor(context);
        result.put("using", using);
        String[] endpoint = PushServiceImpl.endpoint(context);
        if (endpoint != null && using != null) {
            JSObject e = new JSObject();
            e.put("url", endpoint[0]);
            e.put("p256dh", endpoint[1]);
            e.put("auth", endpoint[2]);
            result.put("endpoint", e);
        }
        return result;
    }
}
