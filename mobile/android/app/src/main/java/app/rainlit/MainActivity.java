package app.rainlit;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

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
}
