package com.onyxcalendar.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.text.TextUtils;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;
import android.window.OnBackInvokedDispatcher;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.Executors;

/**
 * The Onyx alarm: as something starts (with Onyx on the lock screen), Android's alarm clock
 * wakes the phone and this fills the screen, over the lock screen, ringing the alarm sound
 * and vibrating until Stop, Snooze 5 min or Leaving now is pressed. Back does nothing.
 */
public class AlarmActivity extends Activity {
    static final String EXTRA_ID = "id", EXTRA_TITLE = "title", EXTRA_START = "start", EXTRA_KIND = "kind";
    private static final long SAFETY_MS = 20 * 60_000; // rings this long at most if left alone

    private MediaPlayer player;
    private Vibrator vibrator;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, () -> { /* rings until a button is pressed */ });
        }
        setContentView(build(getIntent()));
        ring();
        ui.postDelayed(this::stop, SAFETY_MS);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setContentView(build(intent)); // a second one while the first rings: show the newer
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // rings until a button is pressed
    }

    @Override
    protected void onDestroy() {
        silence();
        ui.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private String clock(long ms) {
        return new SimpleDateFormat(DateFormat.is24HourFormat(this) ? "H:mm" : "h:mm a", Locale.getDefault()).format(new Date(ms));
    }

    private View build(Intent intent) {
        String title = intent.getStringExtra(EXTRA_TITLE);
        long start = intent.getLongExtra(EXTRA_START, System.currentTimeMillis());
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(0xFF07080B);
        root.setPadding(dp(24), dp(72), dp(24), dp(40));

        boolean early = start - System.currentTimeMillis() > 60_000;
        TextView label = text(early ? "ONYX  ·  ALARM" : "ONYX  ·  STARTING NOW", 13, OnyxPanel.AMBER, true);
        label.setLetterSpacing(0.14f);
        root.addView(label);

        TextClock clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setFormat24Hour("H:mm");
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 84);
        clock.setTextColor(Color.WHITE);
        clock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        clock.setGravity(Gravity.CENTER);
        root.addView(clock, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView what = text(title == null || title.isEmpty() ? "Your next thing" : title, 30, Color.WHITE, true);
        what.setGravity(Gravity.CENTER);
        what.setMaxLines(3);
        what.setEllipsize(TextUtils.TruncateAt.END);
        what.setPadding(0, dp(28), 0, dp(6));
        root.addView(what, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView when = text((early ? "Starts at " : "Started ") + clock(start), 17, OnyxPanel.MUTED, false);
        when.setGravity(Gravity.CENTER);
        root.addView(when, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        View grow = new View(this);
        root.addView(grow, new LinearLayout.LayoutParams(1, 0, 1));

        root.addView(button("Stop", 0xFFF5B83D, 0xFF1A1206, v -> stop()));
        root.addView(button("Snooze 5 min", 0x33FFFFFF, Color.WHITE, v -> snooze(intent)));
        root.addView(button("task".equals(intent.getStringExtra(EXTRA_KIND)) ? "Done" : "Leaving now", 0x33FFFFFF, Color.WHITE, v -> leaving(intent)));
        return root;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return t;
    }

    private View button(String s, int bg, int fg, View.OnClickListener onClick) {
        TextView b = text(s, 18, fg, true);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(20), dp(18), dp(20), dp(18));
        GradientDrawable d = new GradientDrawable();
        d.setColor(bg);
        d.setCornerRadius(dp(999));
        b.setBackground(d);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        b.setLayoutParams(lp);
        return b;
    }

    // ------------------------------------------------------------ the ringing

    @SuppressWarnings("deprecation")
    private void ring() {
        try {
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, sound);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {
            // no sound to play: the vibration and the screen still come
        }
        try {
            vibrator = Build.VERSION.SDK_INT >= 31 ? getSystemService(VibratorManager.class).getDefaultVibrator() : (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null) vibrator.vibrate(VibrationEffect.createWaveform(new long[] { 0, 700, 500 }, 0));
        } catch (Exception ignored) {
            // no vibrator
        }
    }

    private void silence() {
        try {
            if (player != null) { player.stop(); player.release(); }
        } catch (Exception ignored) {
            // already stopped
        }
        player = null;
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
            // nothing to stop
        }
    }

    private void stop() {
        silence();
        finish();
    }

    private void snooze(Intent intent) {
        schedule(this, intent.getStringExtra(EXTRA_ID), intent.getStringExtra(EXTRA_TITLE), intent.getLongExtra(EXTRA_START, 0),
            intent.getStringExtra(EXTRA_KIND), System.currentTimeMillis() + 5 * 60_000, true);
        stop();
    }

    private void leaving(Intent intent) {
        String id = intent.getStringExtra(EXTRA_ID);
        long start = intent.getLongExtra(EXTRA_START, 0);
        stop();
        if (id == null) return;
        Context app = getApplicationContext();
        Executors.newSingleThreadExecutor().execute(() -> {
            for (LauncherData.Item it : LauncherData.items(app)) {
                if (id.equals(it.id) && it.start == start) {
                    try {
                        LauncherData.acknowledge(app, it);
                    } catch (Exception ignored) {
                        // the PC wasn't reachable
                    }
                    break;
                }
            }
            LauncherData.fetch(app);
            OnyxLiveService.poke(app);
        });
    }

    // ------------------------------------------------------------ setting the alarm

    /**
     * Sets Android's alarm clock for `at`, to open this alarm for the entry. Only one is kept
     * (each new one replaces the last); `snoozed` uses its own slot, so a snooze isn't lost.
     */
    static void schedule(Context ctx, String id, String title, long start, String kind, long at, boolean snoozed) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        Intent open = new Intent(ctx, AlarmActivity.class)
            .putExtra(EXTRA_ID, id).putExtra(EXTRA_TITLE, title).putExtra(EXTRA_START, start).putExtra(EXTRA_KIND, kind)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, snoozed ? 4402 : 4401, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, pi), pi);
        } catch (SecurityException e) {
            // exact alarms not allowed (Android 12): as close as Android allows
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /**
     * Keeps Android's alarm clock set for the first to come: the next start (with "Alarm as
     * things start" on), or an entry whose escalation is Alarm, at its call time.
     */
    static void planNext(Context ctx) {
        long t = System.currentTimeMillis();
        java.util.List<LauncherData.Item> items = LauncherData.items(ctx);
        LauncherData.Item best = null;
        long at = Long.MAX_VALUE;
        if (LauncherData.alarmOn(ctx)) {
            LauncherData.Item n = LauncherData.next(items, t);
            if (n != null) { best = n; at = n.start; }
        }
        for (LauncherData.Item it : items) {
            if (it.done || it.ack) continue;
            for (LauncherData.Alert a : it.alerts) {
                if ("alarm".equals(a.kind) && a.at > t && a.at < at) { best = it; at = a.at; }
            }
        }
        if (best == null) { cancel(ctx); return; }
        String key = best.id + "@" + at;
        if (key.equals(LauncherData.prefs(ctx).getString("alarm_set", ""))) return;
        schedule(ctx, best.id, best.title, best.start, best.kind, at, false);
        LauncherData.prefs(ctx).edit().putString("alarm_set", key).apply();
    }

    /** Takes back the alarm that is set (not a snooze). */
    static void cancel(Context ctx) {
        LauncherData.prefs(ctx).edit().remove("alarm_set").apply();
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        Intent open = new Intent(ctx, AlarmActivity.class);
        PendingIntent pi = PendingIntent.getActivity(ctx, 4401, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_NO_CREATE);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }
}
