package app.rainlit;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * Rainlit's page in the app (res/layout/capacitor_bridge_layout_main.xml puts it in place of
 * Capacitor's own). During a call it stays "on screen" as far as the page's engine can tell,
 * even with the app in the background or the screen off. Otherwise the engine freezes the page
 * a while after it goes out of sight (sooner when the call's quiet: both asleep, say), and a
 * frozen page can't look after the call. Its sound can stall with nothing to restart it, and
 * if the connection hiccups, nothing can mend it until the app's opened again. (The page still
 * hears when the app goes to the background: RainlitPlugin tells it.)
 */
public class RainlitWebView extends CapacitorWebView {

    private boolean awake = false;
    private int windowVisibility = View.VISIBLE; // (what Android says it really is)

    public RainlitWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    /** A call started (stay on screen, as far as the page can tell) or ended (back to the truth). */
    public void setStayAwake(boolean on) {
        if (awake == on) return;
        awake = on;
        super.onWindowVisibilityChanged(on ? View.VISIBLE : windowVisibility);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        windowVisibility = visibility;
        super.onWindowVisibilityChanged(awake ? View.VISIBLE : visibility);
    }
}
