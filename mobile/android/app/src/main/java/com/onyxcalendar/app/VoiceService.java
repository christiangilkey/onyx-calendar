package com.onyxcalendar.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Locale;

/**
 * "Hey Claude": listens on the phone for the wake phrase, then takes what is said next as a task for
 * Onyx (sent to the PC, which reads the day and time out of it; WidgetData.voiceTask). The listening is
 * done here, offline, with Vosk's small English model (VoiceModel): no sound leaves the phone, and only
 * the words said after the phrase are sent. Runs as a foreground service (Android shows its
 * notification and the microphone dot) while it is turned on in Settings → Hey Claude.
 *
 * Both ways of saying it work: "Hey Claude, buy milk tomorrow" in one breath, or "Hey Claude", a chime,
 * then the task. A second chime says it was added; the notification shows what, with Undo.
 */
public class VoiceService extends Service {
    private static final String PREFS = "onyx_voice";
    private static final String CH_LISTEN = "onyx-voice";
    private static final String CH_ADDED = "onyx-voice-added";
    private static final int NOTE_LISTEN = 7301, NOTE_ADDED = 7302;
    static final String TURN_OFF = "com.onyxcalendar.app.voice.OFF";
    static final String UNDO = "com.onyxcalendar.app.voice.UNDO";
    private static final int RATE = 16000;
    private static final long WAIT_MS = 7000; // after the phrase alone: how long to wait for the task

    private static volatile VoiceService instance;
    private static volatile String status = "off"; // off | starting | listening | heard | sending | error
    private static volatile String problem;
    private static volatile Model model; // kept while the app runs: loading it takes a second or two

    private volatile boolean running;
    private Thread worker;
    private PowerManager.WakeLock wake;
    private ToneGenerator tones;

    // ------------------------------------------------------------ settings (kept on the phone)

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean on(Context c) { return prefs(c).getBoolean("on", false); }
    static String phrase(Context c) { return prefs(c).getString("phrase", VoiceWake.DEFAULT); }
    static boolean claude(Context c) { return prefs(c).getBoolean("claude", true); }
    static boolean chime(Context c) { return prefs(c).getBoolean("chime", true); }

    static void setPhrase(Context c, String p) {
        String clean = String.join(" ", VoiceWake.words(p));
        prefs(c).edit().putString("phrase", clean.isEmpty() ? VoiceWake.DEFAULT : clean.length() > 40 ? clean.substring(0, 40) : clean).apply();
        if (instance != null) instance.showListening(); // its notification says the new phrase
    }
    static void setClaude(Context c, boolean v) { prefs(c).edit().putBoolean("claude", v).apply(); }
    static void setChime(Context c, boolean v) { prefs(c).edit().putBoolean("chime", v).apply(); }

    static boolean micAllowed(Context c) {
        return c.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    // ------------------------------------------------------------ what the app and the screens call

    /** Turns it on (kept on through restarts) and starts listening when it can. */
    static void start(Context c) {
        prefs(c).edit().putBoolean("on", true).apply();
        problem = null;
        ensure(c);
    }

    /** Turns it off. */
    static void stop(Context c) {
        prefs(c).edit().putBoolean("on", false).apply();
        if (instance != null) instance.halt();
        else status = "off";
    }

    /**
     * Listening again if it is on but not running (after a restart, or Android stopped it). Called as
     * Onyx, its lock screen panel or Onyx Home comes to the front: Android lets the microphone be
     * started only then, not from the background.
     */
    static void ensure(Context c) {
        if (!on(c) || instance != null || !VoiceModel.ready(c) || !micAllowed(c)) return;
        try {
            Intent i = new Intent(c, VoiceService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
            status = "starting";
        } catch (Exception e) {
            status = "off"; // not allowed from here: the next time Onyx is opened
        }
    }

    /** How it is now, for Settings: { on, listening, status, phrase, claude, chime, mic, waiting, last, ...the model } */
    static JSONObject state(Context c) {
        JSONObject o = VoiceModel.state(c);
        try {
            o.put("available", true);
            o.put("on", on(c));
            o.put("listening", instance != null && instance.running);
            o.put("status", on(c) ? status : "off");
            o.put("phrase", phrase(c));
            o.put("claude", claude(c));
            o.put("chime", chime(c));
            o.put("mic", micAllowed(c));
            o.put("waiting", WidgetData.voiceWaiting(c));
            if (problem != null) o.put("problem", problem);
            String last = prefs(c).getString("last", null);
            if (last != null) o.put("last", new JSONObject(last));
        } catch (Exception ignored) {
            // plain values only
        }
        return o;
    }

    // ------------------------------------------------------------ the service

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        // The notification's buttons (started plainly, not in the foreground): no microphone for these.
        if (TURN_OFF.equals(action)) {
            stop(this);
            if (instance == null) stopSelf();
            return START_NOT_STICKY;
        }
        if (UNDO.equals(action)) {
            String id = intent.getStringExtra("task");
            String title = intent.getStringExtra("title");
            new Thread(() -> {
                undo(id, title);
                if (instance == null) stopSelf(); // started only for this
            }, "onyx-voice-undo").start();
            return running ? START_STICKY : START_NOT_STICKY;
        }
        // Started to listen (in the foreground): it says so first, as Android requires, then checks.
        if (!showListening()) { // Android refused the microphone from here: tried again when Onyx opens
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!on(this) || !VoiceModel.ready(this) || !micAllowed(this)) {
            halt();
            return START_NOT_STICKY;
        }
        instance = this;
        if (!running) {
            running = true;
            status = "starting";
            worker = new Thread(this::listen, "onyx-voice");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (instance == this) instance = null;
        if (!"error".equals(status)) status = "off";
        releaseWake();
        if (tones != null) { tones.release(); tones = null; }
        super.onDestroy();
    }

    private void halt() {
        running = false;
        if (instance == this) instance = null;
        status = "off";
        stopForeground(true);
        stopSelf();
    }

    /** The model taken off the phone: let go of the one in memory too (when nothing is listening with it). */
    static void forgetModel() {
        if (instance != null || model == null) return;
        try { model.close(); } catch (Exception ignored) { /* already gone */ }
        model = null;
    }

    // ------------------------------------------------------------ listening

    @android.annotation.SuppressLint("MissingPermission") // checked before it starts (micAllowed)
    private void listen() {
        AudioRecord mic = null;
        Recognizer rec = null;
        try {
            if (model == null) {
                LibVosk.setLogLevel(LogLevel.WARNINGS);
                model = new Model(VoiceModel.model(this).getAbsolutePath());
            }
            rec = new Recognizer(model, RATE);
            int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            mic = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, RATE));
            if (mic.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("The microphone couldn't be opened.");
            mic.startRecording();
            holdWake();
            status = "listening";
            short[] buf = new short[RATE / 10]; // a tenth of a second at a time
            boolean heard = false;  // the phrase is in what is being said now (chimed already)
            long waitUntil = 0;     // the phrase was said alone: the task is the next thing said, until then
            while (running) {
                int n = mic.read(buf, 0, buf.length);
                if (n <= 0) { Thread.sleep(50); continue; }
                long now = System.currentTimeMillis();
                if (waitUntil > 0 && now > waitUntil) { // nothing said after it
                    waitUntil = 0;
                    status = "listening";
                    tone(ToneGenerator.TONE_PROP_NACK, 120);
                }
                if (rec.acceptWaveForm(buf, n)) {
                    String text = new JSONObject(rec.getResult()).optString("text", "").trim();
                    if (text.isEmpty()) continue;
                    String cmd = VoiceWake.after(text, phrase(this));
                    if (cmd == null && waitUntil > 0) cmd = VoiceWake.command(text); // the task, after the phrase alone
                    if (cmd == null) { heard = false; continue; }
                    if (cmd.isEmpty()) { // the phrase alone: chime (if not yet) and wait for the task
                        if (!heard) tone(ToneGenerator.TONE_PROP_BEEP, 150);
                        heard = false;
                        waitUntil = now + WAIT_MS;
                        status = "heard";
                        continue;
                    }
                    heard = false;
                    waitUntil = 0;
                    if (VoiceWake.cancels(cmd)) { status = "listening"; tone(ToneGenerator.TONE_PROP_NACK, 120); continue; }
                    deliver(cmd);
                } else if (!heard && waitUntil == 0) {
                    String partial = new JSONObject(rec.getPartialResult()).optString("partial", "");
                    if (!partial.isEmpty() && VoiceWake.has(partial, phrase(this))) { // as soon as the phrase is said
                        heard = true;
                        status = "heard";
                        tone(ToneGenerator.TONE_PROP_BEEP, 150);
                    }
                }
            }
        } catch (InterruptedException ignored) {
            // stopping
        } catch (Throwable e) {
            problem = e.getMessage() == null ? "Listening stopped." : e.getMessage();
            status = "error";
            running = false;
        } finally {
            if (mic != null) {
                try { mic.stop(); } catch (Exception ignored) { /* not started */ }
                mic.release();
            }
            if (rec != null) rec.close();
            releaseWake();
            if ("error".equals(status)) { stopForeground(true); stopSelf(); }
        }
    }

    /** Sends a task (in the background, so listening goes on) and says how it went. */
    private void deliver(String cmd) {
        status = "sending";
        final Context c = getApplicationContext();
        final boolean useClaude = claude(c);
        new Thread(() -> {
            JSONObject r = WidgetData.voiceTask(c, cmd, useClaude);
            String state = r.optString("state", "failed");
            try {
                r.put("said", cmd);
                r.put("at", System.currentTimeMillis());
                prefs(c).edit().putString("last", r.toString()).apply();
            } catch (Exception ignored) {
                // not kept
            }
            if (running) status = "listening";
            tone("failed".equals(state) ? ToneGenerator.TONE_PROP_NACK : ToneGenerator.TONE_PROP_ACK, 200);
            showAdded(r);
        }, "onyx-voice-send").start();
    }

    private void undo(String id, String title) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        boolean ok = id != null && WidgetData.undoVoiceTask(this, id);
        if (nm == null) return;
        Notification.Builder b = builder(CH_ADDED)
            .setContentTitle(ok ? "Taken out of Onyx" : "Couldn't take it out")
            .setContentText(ok ? (title == null ? "" : title) : "Open Onyx to delete it there.")
            .setAutoCancel(true);
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(6000);
        nm.notify(NOTE_ADDED, b.build());
    }

    // ------------------------------------------------------------ feedback

    private void tone(int which, int ms) {
        if (!chime(this)) return;
        try {
            if (tones == null) tones = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70);
            tones.startTone(which, ms);
        } catch (Exception ignored) {
            // no tone on this phone just now
        }
        try {
            Vibrator v = getSystemService(Vibrator.class);
            if (v != null && Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Exception ignored) {
            // no buzz
        }
    }

    private void channels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || Build.VERSION.SDK_INT < 26) return;
        if (nm.getNotificationChannel(CH_LISTEN) == null) {
            NotificationChannel ch = new NotificationChannel(CH_LISTEN, "Hey Claude: listening", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("While Onyx listens for “Hey Claude”");
            ch.setSound(null, null);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CH_ADDED) == null) {
            NotificationChannel ch = new NotificationChannel(CH_ADDED, "Hey Claude: added", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("What “Hey Claude” added to Onyx, with Undo");
            ch.setSound(null, null); // the chime says it already
            ch.enableVibration(false);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    private Notification.Builder builder(String channel) {
        channels();
        Intent open = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("onyx://open?view=calendar")).setPackage(getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int im = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return (Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this))
            .setSmallIcon(R.drawable.ic_stat_onyx)
            .setContentIntent(PendingIntent.getActivity(this, 11, open, im));
    }

    /** The service's own notification. False when Android won't let it use the microphone from here. */
    private boolean showListening() {
        int im = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Notification n = builder(CH_LISTEN)
            .setContentTitle("Listening for “" + cap(phrase(this)) + "”")
            .setContentText("Say it, then a task for Onyx. Heard on this phone only.")
            .setOngoing(true)
            .setShowWhen(false)
            .addAction(new Notification.Action.Builder(null, "Turn off",
                PendingIntent.getService(this, 12, new Intent(this, VoiceService.class).setAction(TURN_OFF), im)).build())
            .build();
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTE_LISTEN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTE_LISTEN, n);
            return true;
        } catch (Exception e) {
            problem = "Open Onyx to start listening again.";
            status = "off";
            return false;
        }
    }

    /** "Added to Onyx: Call the dentist · Sat 3:30 PM", with Undo; or that it waits for the PC, or why not. */
    private void showAdded(JSONObject r) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        String state = r.optString("state", "failed");
        String title = r.optString("title", r.optString("said", ""));
        Notification.Builder b = builder(CH_ADDED).setAutoCancel(true).setShowWhen(false);
        if ("added".equals(state)) {
            String when = whenText(r.optString("date", ""), r.optString("time", ""));
            b.setContentTitle("Added to Onyx").setContentText(title + (when.isEmpty() ? "" : " · " + when));
            String id = r.optString("taskId", "");
            if (!id.isEmpty()) {
                Intent undo = new Intent(this, VoiceService.class).setAction(UNDO).putExtra("task", id).putExtra("title", title);
                b.addAction(new Notification.Action.Builder(null, "Undo",
                    PendingIntent.getService(this, 13, undo, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            }
        } else if ("waiting".equals(state)) {
            b.setContentTitle("Saved for Onyx").setContentText(title + " · goes to your PC when it's in reach");
        } else {
            b.setContentTitle("Couldn't add that").setContentText(r.optString("error", "Try again, or add it in Onyx."));
        }
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter("added".equals(state) ? 12000 : 20000);
        nm.notify(NOTE_ADDED, b.build());
    }

    /** "today", "tomorrow", "Sat", with the time when there is one. */
    static String whenText(String date, String time) {
        String day = "";
        try {
            if (!date.isEmpty()) {
                LocalDate d = LocalDate.parse(date), today = LocalDate.now();
                day = d.equals(today) ? "today" : d.equals(today.plusDays(1)) ? "tomorrow"
                    : d.isBefore(today.plusDays(7)) ? d.getDayOfWeek().getDisplayName(java.time.format.TextStyle.SHORT, Locale.getDefault())
                    : d.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM));
            }
            if (!time.isEmpty()) {
                String t = LocalTime.parse(time).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT));
                day = day.isEmpty() ? t : day + " " + t;
            }
        } catch (Exception ignored) {
            // shown without it
        }
        return day;
    }

    private static String cap(String s) {
        StringBuilder out = new StringBuilder();
        for (String w : s.split(" ")) if (!w.isEmpty()) out.append(out.length() > 0 ? " " : "").append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        return out.toString();
    }

    private void holdWake() {
        // The screen off would let the phone sleep between the microphone's reads.
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm == null) return;
        if (wake == null) {
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "onyx:voice");
            wake.setReferenceCounted(false);
        }
        wake.acquire();
    }

    private void releaseWake() {
        if (wake != null && wake.isHeld()) wake.release();
    }
}
