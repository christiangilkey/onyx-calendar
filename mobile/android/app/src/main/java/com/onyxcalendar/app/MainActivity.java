package com.onyxcalendar.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // A start whose page never came up (black, on the first start after an update, or with the PC out of
    // reach) heals itself: the page is loaded again, and if that does not bring it up either, the screen is
    // made again. At most twice for the life of the app, so it never loops.
    //
    // A page that is alive and still starting shows its own start screen (boot.js), which says what it
    // waits for and offers to open with what is saved: that one is given longer before it is reloaded,
    // so a slow start is not cut short and begun again. Only a page that is blank or doesn't answer is
    // reloaded at once.
    private static final long WAIT_MS = 12000;
    private static final long LOOK_AGAIN_MS = 15000;
    private static final int LOOKS_WHILE_STARTING = 2;
    private static int heals;
    private boolean up;
    private int looks;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class); // in-app updates
        registerPlugin(OnyxWidgetPlugin.class);   // the home-screen widgets
        super.onCreate(savedInstanceState);
        watchStart();
    }

    @Override
    public void onResume() {
        super.onResume();
        // "Hey Claude", turned on but not listening (after a restart, or Android stopped it): it may start
        // the microphone again now that Onyx is in front.
        VoiceService.ensure(this);
    }

    /** Asks the page, a while after the start, whether it came up (app.js sets window.onyxReady). */
    private void watchStart() {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv == null || heals >= 2) return;
        looks = 0;
        look(wv, WAIT_MS);
    }

    private void look(WebView wv, long after) {
        wv.postDelayed(() -> {
            if (up || isFinishing() || isDestroyed()) return;
            final boolean[] answered = { false };
            wv.evaluateJavascript("window.onyxReady === true ? 'up' : typeof window.onyxStage === 'function' ? 'starting' : 'blank'", (v) -> {
                answered[0] = true;
                if ("\"up\"".equals(v)) up = true;
                else if ("\"starting\"".equals(v) && looks++ < LOOKS_WHILE_STARTING) look(wv, LOOK_AGAIN_MS);
                else heal(wv);
            });
            // A page that cannot even answer is as stuck as one that says no.
            wv.postDelayed(() -> { if (!answered[0] && !up) heal(wv); }, 3000);
        }, after);
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
