package com.onyxcalendar.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // A start whose page never came up (seen once: black, on the first start after an update, until the
    // app was stopped and opened again) heals itself: the page is loaded again, and if that does not
    // bring it up either, the screen is made again. At most twice for the life of the app, so it never loops.
    private static final long WAIT_MS = 12000;
    private static int heals;
    private boolean up;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class); // in-app updates
        registerPlugin(OnyxWidgetPlugin.class);   // the home-screen widgets
        super.onCreate(savedInstanceState);
        watchStart();
    }

    /** Asks the page, a while after the start, whether it came up (app.js sets window.onyxReady). */
    private void watchStart() {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv == null || heals >= 2) return;
        wv.postDelayed(() -> {
            if (up || isFinishing() || isDestroyed()) return;
            final boolean[] answered = { false };
            wv.evaluateJavascript("window.onyxReady === true", (v) -> {
                answered[0] = true;
                if ("true".equals(v)) up = true;
                else heal(wv);
            });
            // A page that cannot even answer is as stuck as one that says no.
            wv.postDelayed(() -> { if (!answered[0] && !up) heal(wv); }, 3000);
        }, WAIT_MS);
    }

    private void heal(WebView wv) {
        if (up || isFinishing() || isDestroyed() || heals >= 2) return;
        heals++;
        if (heals == 1) {
            wv.reload();
            watchStart(); // and looks again
        } else {
            recreate();
        }
    }
}
