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
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Onyx Home and the lock screen while a Hyperfocus session runs: one calm, centred scene in place of
 * the big clock. The time left on a draining ring, the study companion working under it (the same
 * looping cat as the app, its wall masked away), the goal in large type, the pomodoro when a block
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
     * The cat in headphones at a laptop, looping, muted, its wall masked away (the app's own video and
     * mask, from its web files), so it sits on the screen's own background. Plays only while the screen
     * can be seen; with animations turned off in Android, it stays on its first frame.
     */
    static final class BodyDouble extends FrameLayout implements TextureView.SurfaceTextureListener {
        private final TextureView view;
        private final Paint maskPaint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        private final Rect dst = new Rect();
        private Bitmap mask;
        private MediaPlayer player;
        private Surface surface;
        private boolean want, prepared;

        BodyDouble(Context ctx) {
            super(ctx);
            setWillNotDraw(false);
            view = new TextureView(ctx);
            view.setOpaque(false);
            view.setSurfaceTextureListener(this);
            addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            maskPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
            try (InputStream in = ctx.getAssets().open("public/assets/bodydouble-mask.png")) {
                mask = BitmapFactory.decodeStream(in);
            } catch (Exception e) {
                mask = null; // an app build without it: the cat is left out rather than shown with its wall
            }
            if (mask == null) setVisibility(GONE);
        }

        @Override
        protected void onMeasure(int w, int h) {
            float density = getResources().getDisplayMetrics().density;
            int width = (int) Math.min(MeasureSpec.getSize(w) * 0.6f, 270 * density);
            int height = width * 9 / 16;
            super.onMeasure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
        }

        @Override
        protected void dispatchDraw(Canvas canvas) {
            if (mask == null) return;
            int saved = canvas.saveLayer(0, 0, getWidth(), getHeight(), null);
            super.dispatchDraw(canvas);
            dst.set(0, 0, getWidth(), getHeight());
            canvas.drawBitmap(mask, null, dst, maskPaint);
            canvas.restoreToCount(saved);
        }

        private boolean still() {
            try {
                return Settings.Global.getFloat(getContext().getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
            } catch (Exception e) {
                return false;
            }
        }

        void play(boolean on) {
            want = on;
            if (player == null) return;
            try {
                if (on && prepared && !still()) {
                    if (!player.isPlaying()) player.start();
                } else if (player.isPlaying()) {
                    player.pause();
                }
            } catch (Exception ignored) {
                // a player in a bad state: it is made again with the next surface
            }
        }

        @Override
        public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int h) {
            if (mask == null) return;
            surface = new Surface(st);
            player = new MediaPlayer();
            try {
                try (AssetFileDescriptor fd = getContext().getAssets().openFd("public/assets/bodydouble.mp4")) {
                    player.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
                } catch (Exception compressed) {
                    player.setDataSource(cached().getAbsolutePath()); // stored compressed in the APK: played from a copy
                }
                player.setSurface(surface);
                player.setLooping(true);
                player.setVolume(0f, 0f);
                player.setOnPreparedListener(mp -> {
                    prepared = true;
                    mp.seekTo(0);
                    play(want);
                });
                player.prepareAsync();
            } catch (Exception e) {
                release();
                setVisibility(GONE);
            }
        }

        private File cached() throws Exception {
            File f = new File(getContext().getCacheDir(), "bodydouble.mp4");
            if (f.length() > 0) return f;
            try (InputStream in = getContext().getAssets().open("public/assets/bodydouble.mp4"); OutputStream out = new FileOutputStream(f)) {
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            }
            return f;
        }

        @Override
        public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int h) {
        }

        @Override
        public boolean onSurfaceTextureDestroyed(SurfaceTexture st) {
            release();
            return true;
        }

        @Override
        public void onSurfaceTextureUpdated(SurfaceTexture st) {
            invalidate(); // the mask is drawn again over each new frame
        }

        void release() {
            prepared = false;
            if (player != null) {
                try {
                    player.release();
                } catch (Exception ignored) {
                    // already gone
                }
                player = null;
            }
            if (surface != null) {
                surface.release();
                surface = null;
            }
        }
    }
}
