package com.onyxcalendar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.text.format.DateFormat;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.Executors;

/**
 * The ringing itself: started by Android's alarm clock (AlarmReceiver), it loops the alarm
 * sound at alarm volume and vibrates without stopping, and shows the alarm full screen (or,
 * where Android won't, as a notification with the same buttons). Only Stop, Snooze 5 min or
 * Leaving now end it.
 */
public class AlarmService extends Service {
    static final String ACTION_RING = "com.onyxcalendar.app.alarm.RING";
    static final String ACTION_STOP = "com.onyxcalendar.app.alarm.STOP";
    static final String ACTION_SNOOZE = "com.onyxcalendar.app.alarm.SNOOZE";
    static final String ACTION_LEAVING = "com.onyxcalendar.app.alarm.LEAVING";
    /** Sent to the alarm screen when the ringing ends, so it closes. */
    static final String ACTION_ENDED = "com.onyxcalendar.app.alarm.ENDED";
    static final String CHANNEL = "onyx_alarm";
    static final int ID = 4501;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wake;
    private Intent ringing; // the extras of what is ringing now

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_RING.equals(action)) {
            named(intent);
            ringing = new Intent(intent);
            Notification n = notification(intent);
            try {
                if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
                else startForeground(ID, n);
            } catch (Exception e) {
                // can't run in front: still ring, with the notification posted plainly
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) nm.notify(ID, n);
            }
            ring();
            // The screen: Android shows it from the notification's full-screen intent when it allows; ask too.
            try {
                startActivity(new Intent(this, AlarmActivity.class).putExtras(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            } catch (Exception ignored) {
                // the notification is up either way
            }
            return START_NOT_STICKY;
        }
        Intent what = ringing != null ? ringing : intent;
        if (ACTION_SNOOZE.equals(action) && what != null) {
            AlarmActivity.schedule(this, what.getStringExtra(AlarmActivity.EXTRA_ID), what.getStringExtra(AlarmActivity.EXTRA_TITLE),
                what.getLongExtra(AlarmActivity.EXTRA_START, 0), what.getStringExtra(AlarmActivity.EXTRA_KIND), System.currentTimeMillis() + 5 * 60_000, true);
        }
        if (ACTION_LEAVING.equals(action) && what != null) leaving(what);
        end();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        silence();
        super.onDestroy();
    }

    /**
     * The alarm is named after what is due as it rings: the entry whose alarm time (or start)
     * is now, from what the app handed over or the home screen fetched, as it is now (renamed
     * or moved since the alarm was set). A snooze keeps the entry it was for.
     */
    private void named(Intent intent) {
        long t = System.currentTimeMillis();
        String id = intent.getStringExtra(AlarmActivity.EXTRA_ID);
        String title = null, kind = null;
        long start = 0, best = 3 * 60_000; // within 3 minutes of now
        try {
            org.json.JSONArray list = new org.json.JSONArray(LauncherData.prefs(this).getString("app_alarms", "[]"));
            for (int i = 0; i < list.length(); i++) {
                org.json.JSONObject a = list.optJSONObject(i);
                if (a == null) continue;
                boolean same = id != null && id.equals(a.optString("id"));
                long off = Math.abs(a.optLong("at", 0) - t);
                if (same || off < best) {
                    if (!same) best = off;
                    title = a.optString("title", title);
                    start = a.optLong("start", start);
                    kind = a.optString("kind", kind);
                    if (same) break;
                }
            }
        } catch (Exception ignored) {
            // nothing handed over
        }
        for (LauncherData.Item it : LauncherData.items(this)) {
            if (id != null && id.equals(it.id)) { title = it.title; start = it.start; kind = it.kind; break; }
        }
        if (title != null && !title.isEmpty()) intent.putExtra(AlarmActivity.EXTRA_TITLE, title);
        if (start > 0) intent.putExtra(AlarmActivity.EXTRA_START, start);
        if (kind != null && !kind.isEmpty()) intent.putExtra(AlarmActivity.EXTRA_KIND, kind);
    }

    private void end() {
        silence();
        sendBroadcast(new Intent(ACTION_ENDED).setPackage(getPackageName()));
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(ID);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    // ------------------------------------------------------------ the noise

    @SuppressWarnings("deprecation")
    private void ring() {
        silence();
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "onyx:alarm");
            wake.acquire(60 * 60_000L); // let go of after an hour, whatever happens
        }
        try {
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, sound);
            player.setLooping(true);
            player.prepare();
            // A silent alarm volume would make it pointless: at least two thirds of the way up.
            AudioManager am = getSystemService(AudioManager.class);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                if (am.getStreamVolume(AudioManager.STREAM_ALARM) < max * 2 / 3) am.setStreamVolume(AudioManager.STREAM_ALARM, max * 2 / 3, 0);
            }
            player.start();
        } catch (Exception ignored) {
            // no sound to play: the vibration and the screen still come
        }
        try {
            vibrator = Build.VERSION.SDK_INT >= 31 ? getSystemService(VibratorManager.class).getDefaultVibrator() : (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null) {
                VibrationEffect pattern = VibrationEffect.createWaveform(new long[] { 0, 900, 400, 900, 400 }, 0);
                if (Build.VERSION.SDK_INT >= 33) {
                    vibrator.vibrate(pattern, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
                } else {
                    vibrator.vibrate(pattern);
                }
            }
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
        vibrator = null;
        try {
            if (wake != null && wake.isHeld()) wake.release();
        } catch (Exception ignored) {
            // already let go
        }
        wake = null;
    }

    // ------------------------------------------------------------ the notification with its buttons

    private PendingIntent action(String action, int code) {
        Intent i = new Intent(this, AlarmService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification notification(Intent extras) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarms", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Onyx's alarm as something starts: rings until you press a button");
            ch.setSound(null, null); // the service plays the alarm sound itself, looping
            ch.enableVibration(false); // and vibrates itself
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.setBypassDnd(true);
            nm.createNotificationChannel(ch);
        }
        String title = extras.getStringExtra(AlarmActivity.EXTRA_TITLE);
        long start = extras.getLongExtra(AlarmActivity.EXTRA_START, System.currentTimeMillis());
        String time = new SimpleDateFormat(DateFormat.is24HourFormat(this) ? "H:mm" : "h:mm a", Locale.getDefault()).format(new Date(start));
        Intent screen = new Intent(this, AlarmActivity.class).putExtras(extras).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent full = PendingIntent.getActivity(this, 4502, screen, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean task = "task".equals(extras.getStringExtra(AlarmActivity.EXTRA_KIND));
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_onyx)
            .setContentTitle(title == null || title.isEmpty() ? "Onyx alarm" : title)
            .setContentText("Starts " + time + ". Ringing until you press a button.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(full, true)
            .setContentIntent(full)
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_w_check), "Stop", action(ACTION_STOP, 4503)).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_w_next), "Snooze 5 min", action(ACTION_SNOOZE, 4504)).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_w_open), task ? "Done" : "Leaving now", action(ACTION_LEAVING, 4505)).build())
            .build();
    }

    /** "Leaving now" (or Done, for a task): no more calls about it, through Onyx on the PC. */
    private void leaving(Intent what) {
        String id = what.getStringExtra(AlarmActivity.EXTRA_ID);
        long start = what.getLongExtra(AlarmActivity.EXTRA_START, 0);
        if (id == null) return;
        Context app = getApplicationContext();
        boolean task = "task".equals(what.getStringExtra(AlarmActivity.EXTRA_KIND));
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                if (task) WidgetData.completeTask(app, id);
                else WidgetData.rpc(app, "event:ack", new org.json.JSONArray().put(id));
                LauncherData.prefs(app).edit().putBoolean("ack_" + id + "_" + start, true).apply();
            } catch (Exception ignored) {
                // the PC wasn't reachable
            }
            LauncherData.fetch(app);
            OnyxLiveService.poke(app);
        });
    }
}
