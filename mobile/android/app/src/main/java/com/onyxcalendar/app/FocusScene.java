package com.onyxcalendar.app;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.os.Handler;
import android.os.HandlerThread;
import android.provider.Settings;
import android.text.TextUtils;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Onyx Home and the lock screen while a Hyperfocus session runs: one calm, centred scene in place of
 * the big clock. The time left on a draining ring, the study companion working under it (the same
 * cat as the app, building through the session), the goal in large type, the pomodoro when a block
 * has one, and the hard stop. The rest of the day follows below it, quieter (OnyxPanel).
 */
final class FocusScene {
    static final int ACCENT = 0xFFB9AEFF; // the ring and the work rounds
    static final int REST = 0xFF4E4778; // a deeper shade of it: the breaks
    static final int TEXT = OnyxPanel.TEXT, MUTED = OnyxPanel.MUTED, FAINT = OnyxPanel.FAINT;
    static final int BACKDROP = 0xF2050507; // over the wallpaper or the lock screen while it is on

    final LinearLayout root;
    private final Context ctx;
    private final boolean big;
    private final RingView ring;
    private final BodyDouble cat;
    private final TextView goal, stopLine;
    private final LinearLayout pomoBox;
    private final TextView pomoKind, pomoRound, pomoLeft;
    private final Segments segments;
    private LauncherData.Focus focus;
    private List<LauncherData.Item> items = new ArrayList<>(); // read again each time the panel is built
    private boolean visible, resumed;

    FocusScene(Context ctx, boolean big, View.OnClickListener open) {
        this.ctx = ctx;
        this.big = big;
        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setVisibility(View.GONE);
        root.setOnClickListener(open);
        root.setPadding(0, 0, 0, dp(20));

        // A quiet top line: what this is, and the time of day (the big clock steps aside).
        LinearLayout head = new LinearLayout(ctx);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView name = text("◎  HYPERFOCUS", 12, ACCENT, true);
        name.setLetterSpacing(0.14f);
        head.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextClock now = new TextClock(ctx);
        now.setFormat12Hour("EEE d MMM  ·  h:mm");
        now.setFormat24Hour("EEE d MMM  ·  H:mm");
        now.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        now.setTextColor(MUTED);
        head.addView(now);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hp.bottomMargin = dp(8);
        root.addView(head, hp);

        ring = new RingView(ctx);
        root.addView(ring, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        cat = new BodyDouble(ctx);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = -dp(10);
        root.addView(cat, cp);

        TextView goalLabel = text("GOAL", 11, FAINT, true);
        goalLabel.setLetterSpacing(0.14f);
        LinearLayout.LayoutParams gl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        gl.topMargin = dp(10);
        root.addView(goalLabel, gl);
        goal = text("", big ? 26 : 22, TEXT, true);
        goal.setGravity(Gravity.CENTER);
        goal.setMaxLines(3);
        goal.setEllipsize(TextUtils.TruncateAt.END);
        goal.setPadding(dp(8), dp(4), dp(8), 0);
        root.addView(goal, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // The pomodoro: work or break, the round, the time to the next switch, and every round as a segment.
        pomoBox = new LinearLayout(ctx);
        pomoBox.setOrientation(LinearLayout.VERTICAL);
        pomoBox.setPadding(dp(14), dp(12), dp(14), dp(13));
        GradientDrawable pb = new GradientDrawable();
        pb.setColor(0xD90B0C10);
        pb.setStroke(Math.max(1, dp(1)), 0x14FFFFFF);
        pb.setCornerRadius(dp(16));
        pomoBox.setBackground(pb);
        LinearLayout row = new LinearLayout(ctx);
        row.setGravity(Gravity.CENTER_VERTICAL);
        pomoKind = text("", 11, ACCENT, true);
        pomoKind.setLetterSpacing(0.1f);
        pomoKind.setPadding(dp(9), dp(3), dp(9), dp(3));
        row.addView(pomoKind);
        pomoRound = text("", 13, MUTED, false);
        pomoRound.setPadding(dp(10), 0, 0, 0);
        row.addView(pomoRound, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        pomoLeft = text("", 13, TEXT, true);
        row.addView(pomoLeft);
        pomoBox.addView(row);
        segments = new Segments(ctx);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8));
        sp.topMargin = dp(10);
        pomoBox.addView(segments, sp);
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pp.topMargin = dp(18);
        root.addView(pomoBox, pp);

        stopLine = text("", 13, MUTED, false);
        stopLine.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sl.topMargin = dp(14);
        root.addView(stopLine, sl);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(ctx);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return t;
    }

    private String clock(long ms) {
        String pattern = DateFormat.is24HourFormat(ctx) ? "H:mm" : "h:mm a";
        return new SimpleDateFormat(pattern, Locale.getDefault()).format(new Date(ms));
    }

    boolean on() {
        return focus != null;
    }

    /** The session to show, or null to step aside for the usual screen. */
    void show(LauncherData.Focus f) {
        focus = f;
        visible = f != null;
        if (visible) items = LauncherData.items(ctx);
        root.setVisibility(visible ? View.VISIBLE : View.GONE);
        if (visible) {
            goal.setText(f.goal);
            stopLine.setText("Hard stop " + clock(f.end) + "  ·  one thing until then");
            cat.session(f.start, BodyDouble.phaseAt(f.start, f.end, System.currentTimeMillis()));
            tick();
        }
        cat.play(visible && resumed);
    }

    void resume() {
        resumed = true;
        cat.play(visible);
    }

    void pause() {
        resumed = false;
        cat.play(false);
    }

    void release() {
        cat.release();
    }

    /** Every second: the ring, the time, and the pomodoro. */
    void tick() {
        if (focus == null) return;
        long t = System.currentTimeMillis();
        cat.session(focus.start, BodyDouble.phaseAt(focus.start, focus.end, t));
        ring.set((float) (focus.end - t) / Math.max(1, focus.end - focus.start), OnyxPanel.span(focus.end - t), "until " + clock(focus.end));
        LauncherData.Item now = LauncherData.now(items, t);
        long[] ph = now != null ? now.phase(t) : null;
        pomoBox.setVisibility(ph == null ? View.GONE : View.VISIBLE);
        if (ph == null) return;
        boolean work = ph[0] == 1;
        GradientDrawable chip = new GradientDrawable();
        chip.setColor(work ? 0x2EB9AEFF : 0xFF2A2640);
        chip.setCornerRadius(dp(999));
        pomoKind.setBackground(chip);
        pomoKind.setTextColor(work ? ACCENT : 0xFFCFC9F0);
        pomoKind.setText(work ? "WORK" : "BREAK");
        pomoRound.setText("Round " + ph[3] + " of " + ph[4]);
        List<long[]> chunks = chunks(now);
        int index = -1;
        for (int i = 0; i < chunks.size(); i++) if (t - now.start >= chunks.get(i)[1] && t - now.start < chunks.get(i)[2]) index = i;
        boolean last = index < 0 || index == chunks.size() - 1;
        String left = OnyxPanel.span(ph[1]);
        pomoLeft.setText(last ? left + " to the end of the block" : work ? "break in " + left : "back to work in " + left);
        segments.set(chunks, t - now.start, index);
    }

    /** A pomodoro block's rounds: { 1 work | 0 rest, from, to } in ms from its start. */
    static List<long[]> chunks(LauncherData.Item it) {
        List<long[]> out = new ArrayList<>();
        long total = it.end - it.start, work = it.pomoWork * LauncherData.MIN, rest = Math.max(0, it.pomoRest) * LauncherData.MIN;
        if (work <= 0) return out;
        for (long at = 0; at < total; ) {
            long w = Math.min(work, total - at);
            out.add(new long[] { 1, at, at + w });
            at += w;
            if (at >= total || rest <= 0) continue;
            long r = Math.min(rest, total - at);
            out.add(new long[] { 0, at, at + r });
            at += r;
        }
        return out;
    }

    // ------------------------------------------------------------ the ring

    /** The time left, as a ring draining towards the hard stop, with a soft glow behind it. */
    static final class RingView extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG), disc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG), small = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float progress = 1f;
        private String left = "", until = "";
        private int glowFor = -1;

        RingView(Context ctx) {
            super(ctx);
            track.setStyle(Paint.Style.STROKE);
            track.setColor(0xFF15161B);
            arc.setStyle(Paint.Style.STROKE);
            arc.setColor(ACCENT);
            disc.setColor(0xFF060608);
            big.setColor(TEXT);
            big.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
            big.setTextAlign(Paint.Align.CENTER);
            small.setColor(MUTED);
            small.setTextAlign(Paint.Align.CENTER);
        }

        void set(float p, String left, String until) {
            this.progress = Math.max(0f, Math.min(1f, p));
            this.left = left;
            this.until = until;
            invalidate();
        }

        @Override
        protected void onMeasure(int w, int h) {
            int width = MeasureSpec.getSize(w);
            float density = getResources().getDisplayMetrics().density;
            int size = (int) Math.min(width * 0.8f, 290 * density); // the ring is 78% of it; the rest is its glow
            setMeasuredDimension(width, size);
        }

        @Override
        protected void onDraw(Canvas c) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f, s = getHeight();
            float d = s * 0.78f, stroke = d * 0.13f, r = (d - stroke) / 2f;
            if (glowFor != getHeight()) {
                glow.setShader(new RadialGradient(cx, cy, s / 2f, new int[] { 0x40B9AEFF, 0x14B9AEFF, 0x00B9AEFF }, new float[] { 0f, 0.6f, 1f }, Shader.TileMode.CLAMP));
                glowFor = getHeight();
            }
            c.drawCircle(cx, cy, s / 2f, glow);
            track.setStrokeWidth(stroke);
            arc.setStrokeWidth(stroke);
            box.set(cx - r, cy - r, cx + r, cy + r);
            c.drawCircle(cx, cy, r, track);
            if (progress > 0f) c.drawArc(box, -90f, 360f * progress, false, arc);
            c.drawCircle(cx, cy, r - stroke / 2f, disc);
            // The time, as large as fits inside the inner circle on one line.
            float inner = (r - stroke / 2f) * 2f;
            big.setTextSize(d * 0.17f);
            float tw = big.measureText(left);
            if (tw > inner * 0.8f) big.setTextSize(big.getTextSize() * inner * 0.8f / tw);
            small.setTextSize(d * 0.06f);
            float gap = d * 0.03f;
            float total = big.getTextSize() * 0.75f + gap + small.getTextSize();
            float top = cy - total / 2f;
            c.drawText(left, cx, top + big.getTextSize() * 0.75f, big);
            c.drawText(until, cx, top + big.getTextSize() * 0.75f + gap + small.getTextSize(), small);
        }
    }

    // ------------------------------------------------------------ the pomodoro's rounds

    /** Every round as a segment (its length as wide as its time): done ones full, the current one filling. */
    static final class Segments extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF();
        private List<long[]> chunks = new ArrayList<>();
        private long into;
        private int current = -1;

        Segments(Context ctx) {
            super(ctx);
            ring.setStyle(Paint.Style.STROKE);
            ring.setColor(0x80B9AEFF);
        }

        void set(List<long[]> chunks, long into, int current) {
            this.chunks = chunks;
            this.into = into;
            this.current = current;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            if (chunks.isEmpty()) return;
            float density = getResources().getDisplayMetrics().density, gap = 4 * density, h = getHeight(), rad = h / 2f;
            long total = chunks.get(chunks.size() - 1)[2];
            float usable = getWidth() - gap * (chunks.size() - 1);
            ring.setStrokeWidth(density);
            float x = 0;
            for (int i = 0; i < chunks.size(); i++) {
                long[] k = chunks.get(i);
                boolean work = k[0] == 1;
                float w = Math.max(h, usable * (k[2] - k[1]) / (float) total);
                r.set(x, 0, x + w, h);
                paint.setColor(work ? 0x2EB9AEFF : 0x1A8F86C8);
                c.drawRoundRect(r, rad, rad, paint);
                float done = Math.max(0f, Math.min(1f, (into - k[1]) / (float) (k[2] - k[1])));
                if (done > 0f) {
                    paint.setColor(work ? ACCENT : REST);
                    r.set(x, 0, x + Math.max(h, w * done), h);
                    c.drawRoundRect(r, rad, rad, paint);
                }
                if (i == current) {
                    r.set(x + density / 2f, density / 2f, x + w - density / 2f, h - density / 2f);
                    c.drawRoundRect(r, rad, rad, ring);
                }
                x += w + gap;
            }
        }
    }

    // ------------------------------------------------------------ the study companion

    /**
     * The study cat: a cat in headphones at a laptop, working through the session in three phases that build as
     * it goes (calm for the first third, caffeine for the second, a total physics breakdown for the last), each a
     * loop, with a short clip into the next once the loop playing ends; never back a phase. The app's own videos
     * (its web files, assets/cat-phase*.mp4) each carry their see-through parts: colour on the left half
     * (premultiplied), how solid each pixel is on the right. They are put together here on the GPU, so the cat
     * sits on the screen's own background. Plays only while the screen can be seen; with animations turned off
     * in Android, it shows its phase's first frame.
     */
    static final class BodyDouble extends TextureView implements TextureView.SurfaceTextureListener {
        private static final String[] LOOPS = { "cat-phase1-loop.mp4", "cat-phase2-loop.mp4", "cat-phase3-loop.mp4" };
        private static final String[] INTROS = { null, "cat-phase2-intro.mp4", "cat-phase3-intro.mp4" };
        private static final String VERTEX = "attribute vec2 aPos;\n"
            + "uniform mat4 uMatrix;\n"
            + "varying vec2 vColour;\n"
            + "varying vec2 vMatte;\n"
            + "void main() {\n"
            + "  vec2 u = aPos * 0.5 + 0.5;\n"
            + "  vColour = (uMatrix * vec4(u.x * 0.5, u.y, 0.0, 1.0)).xy;\n"
            + "  vMatte = (uMatrix * vec4(0.5 + u.x * 0.5, u.y, 0.0, 1.0)).xy;\n"
            + "  gl_Position = vec4(aPos, 0.0, 1.0);\n"
            + "}\n";
        // The colour is kept within the matte: that takes away the faint fringe the video's coarser colour leaves at hard edges.
        private static final String FRAGMENT = "#extension GL_OES_EGL_image_external : require\n"
            + "precision mediump float;\n"
            + "uniform samplerExternalOES uTex;\n"
            + "varying vec2 vColour;\n"
            + "varying vec2 vMatte;\n"
            + "void main() {\n"
            + "  float a = texture2D(uTex, vMatte).r;\n"
            + "  gl_FragColor = vec4(min(texture2D(uTex, vColour).rgb, vec3(a)), a);\n"
            + "}\n";
        private static final long NONE = Long.MAX_VALUE;

        // The playing and the drawing happen on a thread of the cat's own; its looper runs the player's callbacks too.
        private HandlerThread thread;
        private Handler gl;
        private EGLDisplay display = EGL14.EGL_NO_DISPLAY;
        private EGLContext context = EGL14.EGL_NO_CONTEXT;
        private EGLSurface eglSurface = EGL14.EGL_NO_SURFACE;
        private SurfaceTexture out, frames;
        private Surface input;
        private int program, texture, aPos, uMatrix, uTex, width, height;
        private final float[] matrix = new float[16];
        private FloatBuffer quad;
        private MediaPlayer player;
        private boolean prepared, intro;
        private int phase = 1;
        private long playing = NONE; // the session the clip playing belongs to
        // Set on the screen's thread, read on the cat's.
        private volatile boolean want;
        private volatile int due = 1;
        private volatile long session = NONE;

        BodyDouble(Context ctx) {
            super(ctx);
            setOpaque(false);
            setSurfaceTextureListener(this);
        }

        /** The phase (1, 2 or 3) at `now` in a session from `start` to its hard stop `end`: its thirds. */
        static int phaseAt(long start, long end, long now) {
            long span = end - start;
            if (span <= 0) return 1;
            double p = (double) (now - start) / span;
            return p < 1.0 / 3 ? 1 : p < 2.0 / 3 ? 2 : 3;
        }

        @Override
        protected void onMeasure(int w, int h) {
            float density = getResources().getDisplayMetrics().density;
            int side = (int) Math.min(MeasureSpec.getSize(w) * 0.52f, 200 * density);
            setMeasuredDimension(side, side);
        }

        /** The session on screen (its start, as a key) and the phase due in it now: a later one waits for the loop playing to end. */
        void session(long key, int phaseDue) {
            if (key != session) {
                session = key;
                due = phaseDue;
            } else if (phaseDue > due) {
                due = phaseDue; // never back, even when the session is made longer
            }
            onCat(this::sync);
        }

        void play(boolean on) {
            want = on;
            onCat(this::sync);
        }

        private void onCat(Runnable r) {
            Handler h = gl;
            if (h != null) h.post(r);
        }

        private boolean still() {
            try {
                return Settings.Global.getFloat(getContext().getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
            } catch (Exception e) {
                return false;
            }
        }

        // ---- the clips (on the cat's thread)

        private void sync() {
            if (player == null) return;
            if (playing != session) { // a new session (or the first): it starts in the phase due, without an intro
                playing = session;
                phase = Math.max(1, Math.min(3, due));
                intro = false;
                open(LOOPS[phase - 1], true);
                return;
            }
            boolean still = still();
            if (due > phase && !intro) {
                if (still || !want) { // not moving: straight to the new phase's first frame
                    phase = Math.min(3, due);
                    open(LOOPS[phase - 1], true);
                    return;
                }
                try {
                    player.setLooping(false); // this loop plays to its end, then on to the next phase
                } catch (Exception ignored) {
                    // the player is between clips
                }
            }
            if (!prepared) return;
            try {
                if (want && !still) {
                    if (!player.isPlaying()) player.start();
                } else if (player.isPlaying()) {
                    player.pause();
                }
            } catch (Exception ignored) {
                // a player in a bad state: it is made again with the next surface
            }
        }

        /** A clip ended: the same loop again, or on to the next phase's intro, or from an intro to its loop. */
        private void next(MediaPlayer mp) {
            if (intro) {
                intro = false;
                open(LOOPS[phase - 1], due <= phase);
            } else if (due > phase && phase < 3) {
                phase++;
                intro = true;
                open(INTROS[phase - 1], false);
            } else {
                try {
                    mp.setLooping(true);
                    mp.seekTo(0);
                    mp.start();
                } catch (Exception e) {
                    open(LOOPS[phase - 1], true);
                }
            }
        }

        private void open(String name, boolean loop) {
            prepared = false;
            try {
                player.reset();
                try (AssetFileDescriptor fd = getContext().getAssets().openFd("public/assets/" + name)) {
                    player.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
                } catch (Exception compressed) {
                    player.setDataSource(cached(name).getAbsolutePath()); // stored compressed in the APK: played from a copy
                }
                player.setSurface(input);
                player.setLooping(loop);
                player.setVolume(0f, 0f);
                player.prepareAsync();
            } catch (Exception e) {
                gone();
            }
        }

        private File cached(String name) throws Exception {
            File f = new File(getContext().getCacheDir(), name);
            if (f.length() > 0) return f;
            try (InputStream in = getContext().getAssets().open("public/assets/" + name); OutputStream o = new FileOutputStream(f)) {
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
            }
            return f;
        }

        /** Something went wrong: no cat, rather than a broken one. */
        private void gone() {
            onCat(this::end);
            new Handler(getContext().getMainLooper()).post(() -> setVisibility(GONE));
        }

        // ---- drawing (on the cat's thread)

        private void begin() {
            try {
                display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
                int[] version = new int[2];
                if (!EGL14.eglInitialize(display, version, 0, version, 1)) throw new IllegalStateException("EGL");
                int[] attrs = {
                    EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                    EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT, EGL14.EGL_NONE,
                };
                EGLConfig[] config = new EGLConfig[1];
                int[] count = new int[1];
                if (!EGL14.eglChooseConfig(display, attrs, 0, config, 0, 1, count, 0) || count[0] == 0) throw new IllegalStateException("EGL config");
                context = EGL14.eglCreateContext(display, config[0], EGL14.EGL_NO_CONTEXT, new int[] { EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE }, 0);
                eglSurface = EGL14.eglCreateWindowSurface(display, config[0], out, new int[] { EGL14.EGL_NONE }, 0);
                if (context == EGL14.EGL_NO_CONTEXT || eglSurface == EGL14.EGL_NO_SURFACE) throw new IllegalStateException("EGL surface");
                if (!EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) throw new IllegalStateException("EGL current");

                program = GLES20.glCreateProgram();
                GLES20.glAttachShader(program, shader(GLES20.GL_VERTEX_SHADER, VERTEX));
                GLES20.glAttachShader(program, shader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT));
                GLES20.glLinkProgram(program);
                int[] linked = new int[1];
                GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0);
                if (linked[0] == 0) throw new IllegalStateException("GL program");
                aPos = GLES20.glGetAttribLocation(program, "aPos");
                uMatrix = GLES20.glGetUniformLocation(program, "uMatrix");
                uTex = GLES20.glGetUniformLocation(program, "uTex");
                quad = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
                quad.put(new float[] { -1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f }).position(0);

                int[] t = new int[1];
                GLES20.glGenTextures(1, t, 0);
                texture = t[0];
                GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
                frames = new SurfaceTexture(texture);
                frames.setOnFrameAvailableListener(st -> draw(), gl);
                input = new Surface(frames);

                player = new MediaPlayer();
                player.setOnPreparedListener(mp -> {
                    prepared = true;
                    if (want && !still()) mp.start();
                    else mp.seekTo(0); // shows its first frame
                });
                player.setOnCompletionListener(this::next);
                player.setOnErrorListener((mp, what, extra) -> {
                    gone();
                    return true;
                });
                playing = NONE;
                sync();
            } catch (Exception e) {
                gone();
            }
        }

        private static int shader(int type, String src) {
            int s = GLES20.glCreateShader(type);
            GLES20.glShaderSource(s, src);
            GLES20.glCompileShader(s);
            return s;
        }

        private void draw() {
            if (frames == null || eglSurface == EGL14.EGL_NO_SURFACE) return;
            try {
                frames.updateTexImage();
                frames.getTransformMatrix(matrix);
                GLES20.glViewport(0, 0, width, height);
                GLES20.glClearColor(0f, 0f, 0f, 0f);
                GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
                GLES20.glUseProgram(program);
                GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
                GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture);
                GLES20.glUniformMatrix4fv(uMatrix, 1, false, matrix, 0);
                GLES20.glUniform1i(uTex, 0);
                GLES20.glEnableVertexAttribArray(aPos);
                GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quad);
                GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
                EGL14.eglSwapBuffers(display, eglSurface);
            } catch (Exception ignored) {
                // the surface is going away
            }
        }

        /** Lets the player, the frames and the drawing surface go (on the cat's thread). */
        private void end() {
            prepared = false;
            if (player != null) {
                try {
                    player.release();
                } catch (Exception ignored) {
                    // already gone
                }
                player = null;
            }
            if (input != null) { input.release(); input = null; }
            if (frames != null) { frames.release(); frames = null; }
            if (display != EGL14.EGL_NO_DISPLAY) {
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
                if (eglSurface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, eglSurface);
                if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context);
                EGL14.eglReleaseThread();
            }
            eglSurface = EGL14.EGL_NO_SURFACE;
            context = EGL14.EGL_NO_CONTEXT;
            display = EGL14.EGL_NO_DISPLAY;
        }

        // ---- the view's surface

        @Override
        public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int h) {
            stop(null);
            out = st;
            width = w;
            height = h;
            thread = new HandlerThread("onyx-cat");
            thread.start();
            gl = new Handler(thread.getLooper());
            gl.post(this::begin);
        }

        @Override
        public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int h) {
            onCat(() -> { width = w; height = h; });
        }

        @Override
        public boolean onSurfaceTextureDestroyed(SurfaceTexture st) {
            // Drawing into it still: it is let go on the cat's thread once that has stopped. Else the view lets it go.
            return !stop(st);
        }

        @Override
        public void onSurfaceTextureUpdated(SurfaceTexture st) {
        }

        void release() {
            stop(null);
        }

        /** Stops the cat's thread (after letting its player and drawing go, and then the surface if given); false when none ran. */
        private boolean stop(SurfaceTexture surface) {
            Handler h = gl;
            HandlerThread t = thread;
            gl = null;
            thread = null;
            if (h == null) return false;
            h.post(() -> {
                end();
                if (surface != null) surface.release();
            });
            t.quitSafely();
            return true;
        }
    }

}
