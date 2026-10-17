package com.onyxcalendar.app;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.format.DateFormat;

import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Onyx on the lock screen. While "Onyx shows on" includes the lock screen, this keeps a
 * live notification there: what is on now with its progress bar, or what is next, with a
 * countdown. When the Pi's call time comes it posts a call alert (filling the locked
 * screen when Android allows), and each time the screen turns on while locked it brings
 * up the full Onyx panel over the lock screen (with "display over other apps").
 */
public class OnyxLiveService extends Service {
    static final String CH_LIVE = "onyx_live", CH_CALLS = "onyx_calls";
    static final int ID_LIVE = 4301, ID_CALL = 4302;
    static final String ACTION_ACK = "com.onyxcalendar.app.ACK", ACTION_POKE = "com.onyxcalendar.app.POKE";
    private static final long EVERY = 30_000, FETCH_EVERY = 5 * 60_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final Set<String> fired = Collections.synchronizedSet(new HashSet<>());
    private long lastFetch;
    private BroadcastReceiver screen;

    /** Starts or stops the service to match "Onyx shows on". */
    static void sync(Context ctx) {
        Intent intent = new Intent(ctx, OnyxLiveService.class);
        if (LauncherData.onLock(ctx)) {
            try {
                ctx.startForegroundService(intent);
            } catch (Exception ignored) {
                // Android doesn't let it start from the background just now; the next open of Onyx starts it
            }
        } else {
            ctx.stopService(intent);
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(ID_CALL);
        }
    }

    /** Fetches and redraws now (after a change in the app or on the home screen). */
    static void poke(Context ctx) {
        if (!LauncherData.onLock(ctx)) return;
        try {
            ctx.startForegroundService(new Intent(ctx, OnyxLiveService.class).setAction(ACTION_POKE));
        } catch (Exception ignored) {
            // picked up at the next round
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        channels();
        screen = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                    update();
                    showLockPanel();
                    if (System.currentTimeMillis() - lastFetch > 60_000) fetch();
                }
            }
        };
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screen, filter);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification live = live();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID_LIVE, live, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(ID_LIVE, live);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!LauncherData.onLock(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String action = intent == null ? null : intent.getAction();
        if (ACTION_ACK.equals(action)) acknowledge(intent.getStringExtra("id"), intent.getLongExtra("start", 0));
        else if (ACTION_POKE.equals(action) || System.currentTimeMillis() - lastFetch > FETCH_EVERY) fetch();
        handler.removeCallbacks(loop);
        handler.postDelayed(loop, EVERY);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(loop);
        try {
            unregisterReceiver(screen);
        } catch (Exception ignored) {
            // already gone
        }
        bg.shutdownNow();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(ID_LIVE);
        super.onDestroy();
    }

    private final Runnable loop = new Runnable() {
        @Override
        public void run() {
            if (System.currentTimeMillis() - lastFetch > FETCH_EVERY) fetch();
            else update();
            handler.postDelayed(this, EVERY);
        }
    };

    private void fetch() {
        lastFetch = System.currentTimeMillis();
        bg.execute(() -> {
            LauncherData.fetch(this);
            handler.post(this::update);
        });
    }

    private void acknowledge(String id, long start) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(ID_CALL);
        if (id == null) return;
        bg.execute(() -> {
            for (LauncherData.Item it : LauncherData.items(this)) {
                if (id.equals(it.id) && (start == 0 || start == it.start)) {
                    try {
                        LauncherData.acknowledge(this, it);
                    } catch (Exception ignored) {
                        // the PC wasn't reachable; the call stays as it was
                    }
                    break;
                }
            }
            LauncherData.fetch(this);
            lastFetch = System.currentTimeMillis();
            handler.post(this::update);
        });
    }

    // ------------------------------------------------------------ the notifications

    private void channels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel live = new NotificationChannel(CH_LIVE, "Now and next (lock screen)", NotificationManager.IMPORTANCE_DEFAULT);
        live.setDescription("What is on now and how long until the next thing, on the lock screen");
        live.setSound(null, null);
        live.enableVibration(false);
        live.setShowBadge(false);
        live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(live);
        NotificationChannel calls = new NotificationChannel(CH_CALLS, "Pi calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("When the Pi phones you about something");
        calls.enableVibration(true);
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(calls);
    }

    private String clock(long ms) {
        return new SimpleDateFormat(DateFormat.is24HourFormat(this) ? "H:mm" : "h:mm a", Locale.getDefault()).format(new Date(ms));
    }

    private PendingIntent openOnyx() {
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("onyx://open?view=calendar")).setPackage(getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification live() {
        long t = System.currentTimeMillis();
        List<LauncherData.Item> items = LauncherData.items(this);
        LauncherData.Item now = LauncherData.now(items, t), next = LauncherData.next(items, t);
        LauncherData.Item coming = LauncherData.callComing(items, t);

        Notification.Builder b = new Notification.Builder(this, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_onyx)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_STATUS)
            .setContentIntent(openOnyx())
            .setShowWhen(true);

        String nextLine = next == null ? "Nothing else today or tomorrow"
            : "Next: " + next.title + " at " + clock(next.start) + (next.leaveAt() > t ? "  ·  leave by " + clock(next.leaveAt()) : "");
        if (coming != null) {
            LauncherData.Alert a = coming.coming(t);
            nextLine += "  ·  " + ("push".equals(a.kind) ? "reminder at " : "Pi calls at ") + clock(a.at);
        }

        if (now != null) {
            int progress = (int) Math.round(1000.0 * (t - now.start) / Math.max(1, now.end - now.start));
            b.setContentTitle(now.title)
                .setContentText(nextLine)
                .setSubText("Now, until " + clock(now.end))
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setWhen(now.end);
            if (Build.VERSION.SDK_INT >= 36) {
                Notification.ProgressStyle style = new Notification.ProgressStyle()
                    .setProgressSegments(Collections.singletonList(new Notification.ProgressStyle.Segment(1000).setColor(now.colorInt(OnyxPanel.ACCENT))))
                    .setProgress(Math.max(0, Math.min(1000, progress)));
                b.setStyle(style);
            } else {
                b.setProgress(1000, Math.max(0, Math.min(1000, progress)), false);
            }
        } else if (next != null) {
            long target = next.leaveAt() > t ? next.leaveAt() : next.start;
            b.setContentTitle("Next: " + next.title)
                .setContentText((next.leaveAt() > t ? "Leave by " + clock(next.leaveAt()) : "Starts " + clock(next.start))
                    + (coming != null ? "  ·  Pi calls at " + clock(coming.coming(t).at) : ""))
                .setSubText(next.leaveAt() > t ? "Until you leave" : "Free until then")
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setWhen(target);
        } else {
            String error = LauncherData.error(this);
            b.setContentTitle("Nothing else today or tomorrow")
                .setContentText(error.isEmpty() ? "Onyx" : error)
                .setShowWhen(false);
        }
        // Android 16's Live Updates: kept at the top of the lock screen and as a chip in the status bar.
        try {
            Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class).invoke(b, true);
        } catch (Exception ignored) {
            // older Android
        }
        return b.build();
    }

    private void update() {
        if (!LauncherData.onLock(this)) {
            stopSelf();
            return;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        nm.notify(ID_LIVE, live());
        long t = System.currentTimeMillis();
        LauncherData.Item calling = LauncherData.calling(LauncherData.items(this), t);
        if (calling == null) {
            nm.cancel(ID_CALL);
            return;
        }
        LauncherData.Alert a = calling.calling(t);
        String key = calling.id + "@" + a.at;
        if (!fired.add(key)) return;
        nm.notify(ID_CALL, callNotification(calling, a, t));
        showLockPanel();
    }

    private Notification callNotification(LauncherData.Item it, LauncherData.Alert a, long t) {
        boolean push = "push".equals(a.kind);
        long leave = it.leaveAt();
        String text = "Starts " + clock(it.start) + (leave > 0 ? (leave > t ? "  ·  leave by " + clock(leave) : "  ·  time to leave") : "");
        Intent ack = new Intent(this, OnyxLiveService.class).setAction(ACTION_ACK).putExtra("id", it.id).putExtra("start", it.start);
        PendingIntent ackIntent = PendingIntent.getService(this, 2, ack, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(this, CH_CALLS)
            .setSmallIcon(R.drawable.ic_stat_onyx)
            .setContentTitle((push ? "Reminder: " : "The Pi is calling: ") + it.title)
            .setContentText(text)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openOnyx())
            .setTimeoutAfter(Math.max(60_000, it.start - t))
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_w_check), "task".equals(it.kind) ? "Done" : "Leaving now", ackIntent).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_w_open), "Open Onyx", openOnyx()).build());
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (km != null && km.isKeyguardLocked() && LauncherData.fullScreenAllowed(this)) {
            Intent panel = new Intent(this, LockPanelActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            b.setFullScreenIntent(PendingIntent.getActivity(this, 3, panel, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT), true);
        }
        return b.build();
    }

    /** The full Onyx panel over the lock screen, when the phone is locked and Android allows it. */
    private void showLockPanel() {
        if (!LauncherData.onLock(this) || !LauncherData.overlayAllowed(this)) return;
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (km == null || !km.isKeyguardLocked()) return;
        try {
            startActivity(new Intent(this, LockPanelActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION));
        } catch (Exception ignored) {
            // the notification is there either way
        }
    }
}
