package com.onyxcalendar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.text.format.DateFormat;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The noise machine: Hyperfocus's sounds, the recordings that come inside the app (assets/sounds), played on
 * the phone itself, on and on, with the screen off and Onyx closed, until stopped or its timer runs out. Nothing
 * is streamed. Started from the app (its noise button), from the lock screen and Onyx Home (their Noise machine
 * part), and stopped or changed from its notification too.
 *
 * Each recording is made into one seamless loop the way the app makes it (focus-plan.js, SOUND_FILES and
 * loopBuffer): the stretch from `start` for `length` seconds, with the `fade` seconds after it blended over its
 * start, levelled by `db`, the rumble under it taken out below `lowCut`. One sound blends into the next.
 */
public class NoiseService extends Service {
    static final String PLAY = "com.onyxcalendar.app.noise.PLAY", STOP = "com.onyxcalendar.app.noise.STOP", NEXT = "com.onyxcalendar.app.noise.NEXT";
    private static final String CHANNEL = "noise";
    private static final int NOTE_ID = 7311;

    /** The sounds, in the order the next-sound button goes through them. */
    static final List<String> KINDS = Arrays.asList("brown", "pink", "white", "rain", "lightrain", "waves");
    static final List<String> NAMES = Arrays.asList("Brown noise", "Pink noise", "White noise", "Rainforest rain", "Light rain", "Beach waves");

    /** One recording and how its loop is made: as in focus-plan.js SOUND_FILES. */
    private static final class Spec {
        final String file;
        final double start, length, fade, db, lowCut;

        Spec(String file, double start, double length, double fade, double db, double lowCut) {
            this.file = file;
            this.start = start;
            this.length = length;
            this.fade = fade;
            this.db = db;
            this.lowCut = lowCut;
        }
    }

    private static Spec spec(String kind) {
        switch (kind) {
            case "pink": return new Spec("pink-noise.mp3", 0.2, 40, 1, -2, 0);
            case "white": return new Spec("white-noise.mp3", 0.2, 28.6, 1, 5.9, 0);
            case "rain": return new Spec("rainforest-rain.mp3", 0.1, 18.7, 2, 6.1, 0);
            case "lightrain": return new Spec("light-rain.mp3", 0.1, 20.2, 2, 15.2, 90);
            case "waves": return new Spec("beach-waves.mp3", 2, 51, 4, 12.5, 0);
            default: return new Spec("brown-noise.mp3", 0.2, 28.6, 1, 4, 0);
        }
    }

    // ------------------------------------------------------------ what is playing (read by the app and the screens)

    private static volatile String kind; // playing now; null when stopped
    private static volatile long endsAt; // when the timer stops it; 0: no timer
    private static final List<Runnable> watchers = new CopyOnWriteArrayList<>();
    private static NoiseService instance;

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("onyx_noise", Context.MODE_PRIVATE);
    }

    static boolean playing() {
        return kind != null;
    }

    /** The sound playing, or the one played last (the one the button starts). */
    static String kind(Context c) {
        String k = kind != null ? kind : prefs(c).getString("kind", "brown");
        return KINDS.contains(k) ? k : "brown";
    }

    static String name(String k) {
        int i = KINDS.indexOf(k);
        return i < 0 ? NAMES.get(0) : NAMES.get(i);
    }

    static int volume(Context c) {
        return Math.max(1, Math.min(100, prefs(c).getInt("volume", 35)));
    }

    /** The timer last picked, in minutes (0: none). */
    static int minutes(Context c) {
        return Math.max(0, Math.min(12 * 60, prefs(c).getInt("minutes", 0)));
    }

    static long endsAt() {
        return kind != null ? endsAt : 0;
    }

    /** Something to run (on the main thread) whenever it starts, stops or changes. */
    static void watch(Runnable r) {
        if (r != null && !watchers.contains(r)) watchers.add(r);
    }

    static void unwatch(Runnable r) {
        watchers.remove(r);
    }

    private static final Handler main = new Handler(Looper.getMainLooper());

    private static void changed() {
        main.post(() -> {
            for (Runnable r : watchers) r.run();
        });
    }

    /** For the app: { playing, kind, name, volume, minutes, endsAt, kinds: [{ kind, name }] }. */
    static JSONObject state(Context c) {
        JSONObject o = new JSONObject();
        try {
            o.put("playing", playing());
            o.put("kind", kind(c));
            o.put("name", name(kind(c)));
            o.put("volume", volume(c));
            o.put("minutes", minutes(c));
            o.put("endsAt", endsAt());
            JSONArray all = new JSONArray();
            for (int i = 0; i < KINDS.size(); i++) all.put(new JSONObject().put("kind", KINDS.get(i)).put("name", NAMES.get(i)));
            o.put("kinds", all);
        } catch (Exception ignored) {
            // plain values
        }
        return o;
    }

    // ------------------------------------------------------------ what the app and the screens call

    /** Plays a sound (or changes to it) at a volume (1-100), stopping by itself after `minutes` (0: never). */
    static void play(Context c, String k, int vol, int mins) {
        if (!KINDS.contains(k)) k = "brown";
        vol = Math.max(1, Math.min(100, vol));
        mins = Math.max(0, Math.min(12 * 60, mins));
        prefs(c).edit().putString("kind", k).putInt("volume", vol).putInt("minutes", mins).apply();
        kind = k;
        endsAt = mins > 0 ? System.currentTimeMillis() + mins * 60_000L : 0;
        changed();
        Intent i = new Intent(c, NoiseService.class).setAction(PLAY);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception e) {
            // Android refused to start it from where it was asked (in the background): nothing plays.
            kind = null;
            endsAt = 0;
            changed();
            Toast.makeText(c.getApplicationContext(), "Open Onyx to start the noise machine.", Toast.LENGTH_LONG).show();
        }
    }

    /** Plays the last sound, with the last volume and timer. */
    static void play(Context c) {
        play(c, kind(c), volume(c), minutes(c));
    }

    static void stop(Context c) {
        if (instance != null) instance.halt();
        else if (kind != null) { kind = null; endsAt = 0; changed(); }
    }

    static void toggle(Context c) {
        if (playing()) stop(c);
        else play(c);
    }

    /** The next sound: playing it at once when one is on, or ready for the button when not. */
    static void next(Context c) {
        String k = KINDS.get((KINDS.indexOf(kind(c)) + 1) % KINDS.size());
        if (playing()) {
            long left = endsAt > 0 ? Math.max(1, (endsAt - System.currentTimeMillis() + 59_999) / 60_000) : 0;
            int keep = minutes(c);
            play(c, k, volume(c), (int) left);
            prefs(c).edit().putInt("minutes", keep).apply(); // the timer runs on; the one picked stays for next time
        } else {
            prefs(c).edit().putString("kind", k).apply();
            changed();
        }
    }

    static void setVolume(Context c, int vol) {
        prefs(c).edit().putInt("volume", Math.max(1, Math.min(100, vol))).apply();
        if (instance != null) instance.level = level(volume(c));
        changed();
    }

    /** The slider (1-100) as a level: a curve, so the low end is usable (focus-plan.js noiseGain). */
    private static float level(int vol) {
        double v = vol / 100.0;
        return (float) Math.min(1.0, v * v * 1.2);
    }

    // ------------------------------------------------------------ the service

    private volatile float level = 0.15f;
    private volatile int gen; // each sound started; an older one fades out when it changes
    private PowerManager.WakeLock wake;
    private boolean noisyWatched;

    /** Headphones pulled out: it stops, as players do, rather than playing out of the speaker. */
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            halt();
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (STOP.equals(action)) {
            showNote(); // a service started in the foreground must say so before it goes
            halt();
            return START_NOT_STICKY;
        }
        if (NEXT.equals(action)) {
            showNote();
            if (playing()) next(this);
            else halt();
            return START_NOT_STICKY;
        }
        if (kind == null) { // stopped before it got here
            showNote();
            halt();
            return START_NOT_STICKY;
        }
        level = level(volume(this));
        showNote();
        if (!noisyWatched) {
            IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(noisy, f);
            noisyWatched = true;
        }
        if (wake == null) {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) {
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "onyx:noise");
                wake.setReferenceCounted(false);
            }
        }
        if (wake != null) wake.acquire(endsAt > 0 ? endsAt - System.currentTimeMillis() + 10_000 : 12 * 3_600_000L);
        // The same sound again (a new timer, say): it plays on as it is, without fading out and in.
        if (!(kind.equals(sounding) && soundingGen == gen)) begin(kind);
        return START_NOT_STICKY;
    }

    private volatile String sounding; // the sound the newest player is making
    private volatile int soundingGen = -1;

    /** Stops: the sound fades out, the notification goes. */
    void halt() {
        gen++;
        kind = null;
        endsAt = 0;
        changed();
        if (noisyWatched) {
            try {
                unregisterReceiver(noisy);
            } catch (Exception ignored) {
                // already gone
            }
            noisyWatched = false;
        }
        if (wake != null && wake.isHeld()) wake.release();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        gen++;
        if (instance == this) instance = null;
        if (kind != null) { kind = null; endsAt = 0; changed(); }
        if (wake != null && wake.isHeld()) wake.release();
        if (noisyWatched) {
            try {
                unregisterReceiver(noisy);
            } catch (Exception ignored) {
                // already gone
            }
        }
        super.onDestroy();
    }

    private void begin(String k) {
        final int my = ++gen;
        sounding = k;
        soundingGen = my;
        new Thread(() -> {
            try {
                Loop loop = loopFor(this, k);
                if (my != gen) return; // changed again while it loaded
                play(loop, my);
            } catch (Exception e) {
                main.post(() -> {
                    if (my != gen) return;
                    Toast.makeText(this, "Can't play " + name(k) + ".", Toast.LENGTH_LONG).show();
                    halt();
                });
            }
        }, "onyx-noise").start();
    }

    /** Plays a loop on and on until a newer sound or a stop, fading in, and out at the end. */
    private void play(Loop loop, int my) {
        int mask = loop.channels == 1 ? AudioFormat.CHANNEL_OUT_MONO : AudioFormat.CHANNEL_OUT_STEREO;
        int min = AudioTrack.getMinBufferSize(loop.rate, mask, AudioFormat.ENCODING_PCM_16BIT);
        AudioTrack t = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(loop.rate).setChannelMask(mask).build())
            .setBufferSizeInBytes(Math.max(min * 2, loop.rate * loop.channels)) // half a second
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build();
        float v = 0.0001f;
        t.setVolume(v);
        t.play();
        int chunk = loop.rate / 20 * loop.channels; // 50 ms, whole frames
        int at = 0;
        boolean timedOut = false;
        try {
            while (true) {
                boolean on = my == gen && kind != null;
                if (on && endsAt > 0 && System.currentTimeMillis() >= endsAt) { on = false; timedOut = true; }
                float target = on ? level : 0f;
                // About a second to come in, two to fade away (and one sound blends into the next).
                v += (target - v) * (on ? 0.12f : 0.08f);
                if (!on && v < 0.002f) break;
                t.setVolume(Math.max(0f, v));
                int n = Math.min(chunk, loop.pcm.length - at);
                int wrote = t.write(loop.pcm, at, n);
                if (wrote < 0) break;
                at += wrote;
                if (at >= loop.pcm.length) at = 0;
            }
        } finally {
            try {
                t.stop();
            } catch (Exception ignored) {
                // already stopped
            }
            t.release();
        }
        if (timedOut) main.post(() -> { if (my == gen) halt(); });
    }

    // ------------------------------------------------------------ the loop, made from the recording

    private static final class Loop {
        final String kind;
        final short[] pcm; // interleaved
        final int rate, channels;

        Loop(String kind, short[] pcm, int rate, int channels) {
            this.kind = kind;
            this.pcm = pcm;
            this.rate = rate;
            this.channels = channels;
        }
    }

    private static Loop last; // the last one made: played again at once

    private static synchronized Loop loopFor(Context c, String k) throws Exception {
        if (last != null && last.kind.equals(k)) return last;
        last = null; // one at a time: they are several megabytes each
        Spec s = spec(k);
        MediaExtractor ex = new MediaExtractor();
        open(c, ex, s.file);
        int track = -1;
        MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i);
            String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) { track = i; fmt = f; break; }
        }
        if (track < 0) { ex.release(); throw new IllegalStateException("no audio in " + s.file); }
        ex.selectTrack(track);
        MediaCodec codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
        codec.configure(fmt, null, null, 0);
        codec.start();
        int rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE), ch = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        short[] out = new short[1 << 20];
        int size = 0;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inDone = false, outDone = false;
        try {
            // Only as much as the loop takes: its start, its length and the blend after it.
            while (!outDone && size < (long) ((s.start + s.length + s.fade + 0.5) * rate) * ch) {
                if (!inDone) {
                    int ii = codec.dequeueInputBuffer(10_000);
                    if (ii >= 0) {
                        ByteBuffer b = codec.getInputBuffer(ii);
                        int n = b == null ? -1 : ex.readSampleData(b, 0);
                        if (n < 0) {
                            codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inDone = true;
                        } else {
                            codec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0);
                            ex.advance();
                        }
                    }
                }
                int oi = codec.dequeueOutputBuffer(info, 10_000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = codec.getOutputFormat();
                    rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                } else if (oi >= 0) {
                    ByteBuffer ob = codec.getOutputBuffer(oi);
                    if (ob != null && info.size > 0) {
                        ob.position(info.offset);
                        ob.limit(info.offset + info.size);
                        ShortBuffer sb = ob.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();
                        int n = sb.remaining();
                        if (size + n > out.length) out = Arrays.copyOf(out, Math.max(out.length * 2, size + n));
                        sb.get(out, size, n);
                        size += n;
                    }
                    codec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
            }
        } finally {
            try {
                codec.stop();
            } catch (Exception ignored) {
                // stopped
            }
            codec.release();
            ex.release();
        }
        if (s.lowCut > 0) highpass(out, size, ch, rate, s.lowCut);
        int frames = size / ch;
        int st = (int) Math.min(Math.round(s.start * rate), frames / 4);
        int fd = (int) Math.max(1, Math.min(Math.round(s.fade * rate), (frames - st) / 3));
        int n = (int) Math.min(Math.round(s.length * rate), frames - st - fd);
        if (n <= 0) throw new IllegalStateException("too short: " + s.file);
        float gain = (float) Math.pow(10, s.db / 20);
        short[] loop = new short[n * ch];
        for (int i = 0; i < n; i++) {
            double t = (i + 0.5) / fd;
            for (int c2 = 0; c2 < ch; c2++) {
                float v = out[(st + i) * ch + c2];
                // The stretch after it, blended over its start (equal power, so the blend is no quieter).
                if (i < fd) v = (float) (v * Math.sqrt(t) + out[(st + n + i) * ch + c2] * Math.sqrt(1 - t));
                v *= gain;
                loop[i * ch + c2] = (short) Math.max(-32768, Math.min(32767, Math.round(v)));
            }
        }
        last = new Loop(k, loop, rate, ch);
        return last;
    }

    /** The recording, from inside the app: as it is, or (were it packed) copied out once. */
    private static void open(Context c, MediaExtractor ex, String file) throws Exception {
        String path = "public/assets/sounds/" + file;
        try (AssetFileDescriptor fd = c.getAssets().openFd(path)) {
            ex.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            return;
        } catch (java.io.FileNotFoundException packed) {
            // compressed in the app: read from a copy instead
        }
        File copy = new File(c.getCacheDir(), "noise-" + file);
        if (!copy.exists() || copy.length() == 0) {
            try (InputStream in = c.getAssets().open(path); OutputStream o = new FileOutputStream(copy)) {
                byte[] buf = new byte[64 * 1024];
                for (int r; (r = in.read(buf)) > 0; ) o.write(buf, 0, r);
            }
        }
        ex.setDataSource(copy.getAbsolutePath());
    }

    /** Takes out what is under `hz` (a second-order high-pass), in place. */
    private static void highpass(short[] pcm, int size, int ch, int rate, double hz) {
        double w = 2 * Math.PI * hz / rate, cos = Math.cos(w), alpha = Math.sin(w) / (2 * 0.7071);
        double a0 = 1 + alpha;
        double b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
        for (int c2 = 0; c2 < ch; c2++) {
            double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            for (int i = c2; i < size; i += ch) {
                double x = pcm[i];
                double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
                x2 = x1;
                x1 = x;
                y2 = y1;
                y1 = y;
                pcm[i] = (short) Math.max(-32768, Math.min(32767, Math.round(y)));
            }
        }
    }

    // ------------------------------------------------------------ the notification

    private void showNote() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Noise machine", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("While the noise machine plays: what is on, and Stop");
            ch.setSound(null, null);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        String k = kind(this);
        String text = name(k) + (endsAt() > 0 ? " · stops at " + DateFormat.getTimeFormat(this).format(new java.util.Date(endsAt())) : "");
        int im = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("onyx://open?view=calendar")).setPackage(getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Notification.Builder b = (Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this))
            .setSmallIcon(R.drawable.ic_stat_onyx)
            .setContentTitle("Noise machine")
            .setContentText(text)
            .setOngoing(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(PendingIntent.getActivity(this, 1, open, im))
            .addAction(new Notification.Action.Builder(null, "Next sound",
                PendingIntent.getService(this, 2, new Intent(this, NoiseService.class).setAction(NEXT), im)).build())
            .addAction(new Notification.Action.Builder(null, "Stop",
                PendingIntent.getService(this, 3, new Intent(this, NoiseService.class).setAction(STOP), im)).build());
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTE_ID, n);
    }
}
