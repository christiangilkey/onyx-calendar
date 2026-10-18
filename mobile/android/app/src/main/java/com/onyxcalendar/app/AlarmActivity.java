package com.onyxcalendar.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * The Onyx alarm, full screen over the lock screen with the screen woken. The ringing and
 * shaking come from AlarmService; this shows what it is for and the buttons that stop it:
 * Stop, Snooze 5 min, Leaving now. Back does nothing.
 */
public class AlarmActivity extends Activity {
    static final String EXTRA_ID = "id", EXTRA_TITLE = "title", EXTRA_START = "start", EXTRA_KIND = "kind";

    private final BroadcastReceiver ended = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            finish();
        }
    };

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
        IntentFilter filter = new IntentFilter(AlarmService.ACTION_ENDED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(ended, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(ended, filter);
        setContentView(build(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setContentView(build(intent));
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // rings until a button is pressed
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(ended);
        } catch (Exception ignored) {
            // never registered
        }
        super.onDestroy();
    }

    private String clock(long ms) {
        return new SimpleDateFormat(DateFormat.is24HourFormat(this) ? "H:mm" : "h:mm a", Locale.getDefault()).format(new Date(ms));
    }

    private View build(Intent intent) {
        String title = intent.getStringExtra(EXTRA_TITLE);
        long start = intent.getLongExtra(EXTRA_START, System.currentTimeMillis());
        boolean early = start - System.currentTimeMillis() > 60_000;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(0xFF07080B);
        root.setPadding(dp(24), dp(72), dp(24), dp(40));

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

        root.addView(button("Stop", 0xFFF5B83D, 0xFF1A1206, v -> send(AlarmService.ACTION_STOP)));
        root.addView(button("Snooze 5 min", 0x33FFFFFF, Color.WHITE, v -> send(AlarmService.ACTION_SNOOZE)));
        root.addView(button("task".equals(intent.getStringExtra(EXTRA_KIND)) ? "Done" : "Leaving now", 0x33FFFFFF, Color.WHITE, v -> send(AlarmService.ACTION_LEAVING)));
        return root;
    }

    private void send(String action) {
        try {
            startService(new Intent(this, AlarmService.class).setAction(action));
        } catch (Exception ignored) {
            // the ringing already ended
        }
        finish();
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

    // ------------------------------------------------------------ setting the alarm

    /**
     * Sets Android's alarm clock for `at` (it wakes the phone from sleep at that minute) to ring
     * for the entry. One is kept (each new one replaces the last); a snooze has its own slot.
     */
    static void schedule(Context ctx, String id, String title, long start, String kind, long at, boolean snoozed) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        Intent fire = new Intent(ctx, AlarmReceiver.class)
            .putExtra(EXTRA_ID, id).putExtra(EXTRA_TITLE, title).putExtra(EXTRA_START, start).putExtra(EXTRA_KIND, kind);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, snoozed ? 4402 : 4401, fire, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        // Tapping the alarm icon in the status bar opens Onyx.
        Intent open = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("onyx://open?view=calendar")).setPackage(ctx.getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent show = PendingIntent.getActivity(ctx, 4403, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi);
        } catch (SecurityException e) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /** Takes back the alarm that is set (not a snooze). */
    static void cancel(Context ctx) {
        LauncherData.prefs(ctx).edit().remove("alarm_set").apply();
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 4401, new Intent(ctx, AlarmReceiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_NO_CREATE);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }

    /** The alarms the Onyx app handed over (setAlarms): { id, title, start, kind, at, why: 'start' | 'alarm' }. */
    static void setFromApp(Context ctx, JSONArray list) {
        LauncherData.prefs(ctx).edit().putString("app_alarms", list == null ? "[]" : list.toString()).apply();
        planNext(ctx);
    }

    /**
     * Keeps Android's alarm clock set for the first to come: an entry whose escalation is
     * Alarm (at its call time), or, with "Alarm as things start" on, the next start. From what
     * the Onyx app handed over, and what the home screen and lock screen fetched.
     */
    static void planNext(Context ctx) {
        long t = System.currentTimeMillis();
        boolean starts = LauncherData.alarmOn(ctx);
        String bestId = null, bestTitle = null, bestKind = null;
        long bestStart = 0, at = Long.MAX_VALUE;
        try {
            JSONArray list = new JSONArray(LauncherData.prefs(ctx).getString("app_alarms", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.optJSONObject(i);
                if (a == null) continue;
                long when = a.optLong("at", 0);
                if (when <= t || when >= at) continue;
                if (!"alarm".equals(a.optString("why")) && !starts) continue;
                at = when;
                bestId = a.optString("id");
                bestTitle = a.optString("title");
                bestStart = a.optLong("start", when);
                bestKind = a.optString("kind", "event");
            }
        } catch (Exception ignored) {
            // nothing handed over
        }
        List<LauncherData.Item> items = LauncherData.items(ctx);
        if (starts) {
            LauncherData.Item n = LauncherData.next(items, t);
            if (n != null && n.start < at) { at = n.start; bestId = n.id; bestTitle = n.title; bestStart = n.start; bestKind = n.kind; }
        }
        for (LauncherData.Item it : items) {
            if (it.done || it.ack) continue;
            for (LauncherData.Alert a : it.alerts) {
                if ("alarm".equals(a.kind) && a.at > t && a.at < at) { at = a.at; bestId = it.id; bestTitle = it.title; bestStart = it.start; bestKind = it.kind; }
            }
        }
        if (bestId == null) {
            cancel(ctx);
            return;
        }
        String key = bestId + "@" + at;
        if (key.equals(LauncherData.prefs(ctx).getString("alarm_set", ""))) return;
        schedule(ctx, bestId, bestTitle, bestStart, bestKind, at, false);
        LauncherData.prefs(ctx).edit().putString("alarm_set", key).apply();
    }
}
