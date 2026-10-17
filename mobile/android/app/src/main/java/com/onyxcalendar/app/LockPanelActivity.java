package com.onyxcalendar.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The Onyx panel over the lock screen: the clock, what is on now and next, the Pi's call
 * and the day, shown as the screen turns on while the phone is locked. Swipe up (or tap
 * Unlock) to unlock as usual; anything that opens Onyx asks to unlock first.
 */
public class LockPanelActivity extends Activity implements OnyxPanel.Host {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private OnyxPanel panel;
    private boolean resumed, unlocking;
    private GestureDetector swipe;

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (swipe != null) swipe.onTouchEvent(ev);
        return super.dispatchTouchEvent(ev);
    }

    private final BroadcastReceiver unlocked = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            finish(); // unlocked some other way (fingerprint, face): out of the way
        }
    };

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (km == null || !km.isKeyguardLocked() || !LauncherData.onLock(this)) {
            finish();
            return;
        }
        setContentView(build());
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::finish);
        }
        IntentFilter filter = new IntentFilter(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(unlocked, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(unlocked, filter);
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(unlocked);
        } catch (Exception ignored) {
            // never registered
        }
        bg.shutdownNow();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (panel != null) panel.render();
        ui.removeCallbacks(ticker);
        ui.post(ticker);
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        ui.removeCallbacks(ticker);
    }

    /** The screen went off or something else came up: shown afresh next time. */
    @Override
    protected void onStop() {
        super.onStop();
        if (!unlocking) finish(); // not while Android asks for the PIN on top of it
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        finish();
    }

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!resumed) return;
            if (panel != null && panel.tick()) panel.render();
            ui.postDelayed(this, 1000 - System.currentTimeMillis() % 1000);
        }
    };

    @SuppressLint("ClickableViewAccessibility")
    private View build() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xCC000000);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextClock clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setFormat24Hour("H:mm");
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 76);
        clock.setTextColor(Color.WHITE);
        clock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        clock.setGravity(Gravity.CENTER);
        content.addView(clock, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, MMMM d");
        date.setFormat24Hour("EEEE, MMMM d");
        date.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        date.setTextColor(0xEEFFFFFF);
        date.setGravity(Gravity.CENTER);
        date.setPadding(0, 0, 0, dp(20));
        content.addView(date, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        panel = new OnyxPanel(this, this, true);
        content.addView(panel.root);

        TextView unlock = new TextView(this);
        unlock.setText("︿  Unlock");
        unlock.setTextColor(Color.WHITE);
        unlock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        unlock.setGravity(Gravity.CENTER);
        unlock.setPadding(dp(24), dp(12), dp(24), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(dp(999));
        unlock.setBackground(bg);
        unlock.setOnClickListener(v -> unlock(null));
        LinearLayout.LayoutParams ul = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ul.gravity = Gravity.CENTER_HORIZONTAL;
        ul.topMargin = dp(10);
        column.addView(unlock, ul);

        // Swipe up to unlock, watched for the whole screen (the scrolling list keeps its touches from its parents).
        swipe = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                if (vy < -dp(500) && Math.abs(vy) > Math.abs(vx) * 1.4f && !scroll.canScrollVertically(1)) {
                    unlock(null);
                    return true;
                }
                return false;
            }
        });

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            content.setPadding(dp(16) + bars.left, bars.top + dp(36), dp(16) + bars.right, dp(12));
            column.setPadding(0, 0, 0, bars.bottom + dp(18));
            return WindowInsetsCompat.CONSUMED;
        });
        return root;
    }

    /** Asks Android to unlock; then does `then` (if anything) and gets out of the way. */
    private void unlock(Runnable then) {
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (km == null || !km.isKeyguardLocked()) {
            if (then != null) then.run();
            finish();
            return;
        }
        unlocking = true;
        km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
            @Override
            public void onDismissSucceeded() {
                unlocking = false;
                if (then != null) then.run();
                finish();
            }

            @Override
            public void onDismissCancelled() {
                unlocking = false;
            }

            @Override
            public void onDismissError() {
                unlocking = false;
                finish();
            }
        });
    }

    @Override
    public void openOnyx(String day) {
        unlock(() -> {
            String url = "onyx://open?view=calendar" + (day != null ? "&date=" + day : "") + "&n=" + System.currentTimeMillis();
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {
                // nothing to open it with
            }
        });
    }

    @Override
    public void acknowledge(LauncherData.Item item) {
        bg.execute(() -> {
            String error = null;
            try {
                LauncherData.acknowledge(this, item);
            } catch (Exception e) {
                error = e.getMessage();
            }
            LauncherData.fetch(this);
            String shown = error;
            ui.post(() -> {
                if (shown != null) Toast.makeText(this, shown, Toast.LENGTH_LONG).show();
                if (panel != null) panel.render();
                OnyxLiveService.poke(this);
            });
        });
    }
}
