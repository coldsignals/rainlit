package app.rainlit;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.WebViewListener;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RainlitPlugin.class);
        // Another Rainlit server, if you picked one (null: rainlit.app, as built in).
        config = ServerChoice.config(this);
        super.onCreate(savedInstanceState);

        // Draw behind the status and navigation bars on every Android version (15 and up do
        // anyway), and let the page leave exactly the room they need. Without this, Android
        // 14 and older left that room twice: a gap above the header and below the message box.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) getWindow().setNavigationBarContrastEnforced(false);
        // Tell each page that loads how big the bars are (it arrives after the app starts).
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    ViewCompat.requestApplyInsets(getWindow().getDecorView());
                }

                // The page's engine (its own process) stopped: Android closed it to free up
                // memory, or it crashed. Left to itself, Android then closes the whole app too,
                // ending the call. Instead the app's screen starts over, and the page joins the
                // call again by itself (CallService keeps the call's place meanwhile).
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    RainlitPlugin.recordRestart(MainActivity.this, detail.didCrash() ? "crashed" : "memory");
                    getWindow().getDecorView().post(() -> recreate());
                    return true;
                }
            });
        }

        // Another server than rainlit.app gets the mic and camera only once you've said so, in a box
        // of Android's own that its page can't press (as the Windows app asks), and only for the
        // server itself, not something it shows inside it. (rainlit.app: as it always was.)
        String server = ServerChoice.picked(this);
        if (getBridge() != null && server != null) {
            getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(PermissionRequest request) {
                    Uri from = request.getOrigin();
                    if (from == null || !server.equals(from.getScheme() + "://" + from.getAuthority())) {
                        request.deny();
                        return;
                    }
                    Boolean said = ServerChoice.mediaAnswer(MainActivity.this, server);
                    if (Boolean.FALSE.equals(said)) request.deny();
                    else if (Boolean.TRUE.equals(said)) super.onPermissionRequest(request);
                    else askAboutMedia(server, (yes) -> {
                        if (yes) super.onPermissionRequest(request);
                        else request.deny();
                    });
                }
            });
        }

        // Android 13 and up ask before an app can show notifications (calls, messages).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }

        // Save buttons (links to files, with "download") save to Downloads/Rainlit.
        if (getBridge() != null) {
            getBridge().getWebView().setDownloadListener((url, userAgent, disposition, type, length) -> {
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    Saving.download(this, url, android.webkit.URLUtil.guessFileName(url, disposition, type), type);
                }
            });
        }

        // Back: let the page close whatever's open (a dialog, a conversation). If there's
        // nothing to close, tuck the app away instead of quitting, so calls keep going.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    moveTaskToBack(true);
                    return;
                }
                webView.evaluateJavascript("typeof window.rainlitBack === 'function' && window.rainlitBack() === true", (handled) -> {
                    if (!"true".equals(handled)) moveTaskToBack(true);
                });
            }
        });
    }

    // Asking about the mic and camera (once at a time: whatever else asks meanwhile gets the same answer).
    private final List<Consumer<Boolean>> waitingForMedia = new ArrayList<>();

    private void askAboutMedia(String server, Consumer<Boolean> answer) {
        waitingForMedia.add(answer);
        if (waitingForMedia.size() > 1) return;
        final boolean[] done = { false };
        Consumer<Boolean> said = (yes) -> {
            if (done[0]) return;
            done[0] = true;
            ServerChoice.answerMedia(this, server, yes);
            List<Consumer<Boolean>> all = new ArrayList<>(waitingForMedia);
            waitingForMedia.clear();
            for (Consumer<Boolean> c : all) c.accept(yes);
        };
        new AlertDialog.Builder(this)
            .setTitle(Uri.parse(server).getAuthority() + " wants to use your microphone and camera")
            .setMessage("For calls and voice channels on that server. Rainlit asks because this server isn't rainlit.app. Only allow one you trust.")
            .setPositiveButton("Allow", (d, w) -> said.accept(true))
            .setNegativeButton("Don't allow", (d, w) -> said.accept(false))
            .setOnCancelListener((d) -> said.accept(false))
            .show();
    }
}
