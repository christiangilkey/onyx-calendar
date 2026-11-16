package com.onyxcalendar.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * What is playing (Spotify, YouTube Music, a podcast app...) for the Onyx panel over the lock screen:
 * the art, the song and artist, a bar to drag through the song (with the time played and its length),
 * and back 15 s / previous / play-pause / next / forward 15 s, under the Onyx panel and above the
 * notifications. Reads the media sessions through Notification
 * access, which the notification list already needs. A tap on the card unlocks and opens the app.
 */
final class NowPlaying {
    final LinearLayout root;
    private final Activity a;
    private final Handler ui;
    private final Consumer<PendingIntent> open; // unlocks, then opens what the app gave for it
    private MediaSessionManager sessions;
    private final List<MediaController> watched = new ArrayList<>();
    private boolean started;

    private final MediaController.Callback changed = new MediaController.Callback() {
        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            ui.post(NowPlaying.this::render);
        }

        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            ui.post(NowPlaying.this::render);
        }

        @Override
        public void onSessionDestroyed() {
            ui.post(NowPlaying.this::render);
        }
    };
    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsChanged = (list) -> later();

    private void later() {
        ui.post(this::render);
    }

    NowPlaying(Activity a, Handler ui, Consumer<PendingIntent> open) {
        this.a = a;
        this.ui = ui;
        this.open = open;
        root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, a.getResources().getDisplayMetrics()));
    }

    /** Starts following the media sessions (the panel is showing). */
    void start() {
        started = true;
        if (!OnyxNotificationListener.allowed(a)) {
            render();
            return;
        }
        try {
            sessions = a.getSystemService(MediaSessionManager.class);
            if (sessions != null) sessions.addOnActiveSessionsChangedListener(sessionsChanged, OnyxNotificationListener.component(a), ui);
        } catch (Exception e) {
            sessions = null; // no access after all: nothing to show
        }
        render();
    }

    /** Stops following them (the panel is hidden). */
    void stop() {
        started = false;
        dragging = false;
        ui.removeCallbacks(tick);
        try {
            if (sessions != null) sessions.removeOnActiveSessionsChangedListener(sessionsChanged);
        } catch (Exception ignored) {
            // already gone
        }
        unwatch();
    }

    private void unwatch() {
        for (MediaController c : watched) {
            try {
                c.unregisterCallback(changed);
            } catch (Exception ignored) {
                // its session ended
            }
        }
        watched.clear();
    }

    private static boolean playing(PlaybackState s) {
        if (s == null) return false;
        int st = s.getState();
        return st == PlaybackState.STATE_PLAYING || st == PlaybackState.STATE_BUFFERING || st == PlaybackState.STATE_CONNECTING;
    }

    /** The one to show: the one playing, else the latest one that is paused with something loaded. */
    private MediaController pick() {
        if (sessions == null) return null;
        List<MediaController> list;
        try {
            list = sessions.getActiveSessions(OnyxNotificationListener.component(a));
        } catch (Exception e) {
            return null;
        }
        unwatch();
        MediaController best = null;
        for (MediaController c : list) {
            if (a.getPackageName().equals(c.getPackageName())) continue; // Onyx's own sounds
            try {
                c.registerCallback(changed, ui);
                watched.add(c);
            } catch (Exception ignored) {
                // gone already
            }
            MediaMetadata m = c.getMetadata();
            if (m == null || TextUtils.isEmpty(m.getString(MediaMetadata.METADATA_KEY_TITLE))) continue;
            PlaybackState s = c.getPlaybackState();
            if (playing(s)) return c;
            if (best == null && s != null && s.getState() == PlaybackState.STATE_PAUSED) best = c;
        }
        return best;
    }

    void render() {
        if (dragging) { wanted = true; return; } // not under the finger: drawn again when it lets go
        ui.removeCallbacks(tick);
        shown = null;
        bar = null;
        root.removeAllViews();
        if (!started) return;
        MediaController c = pick();
        if (c == null) return;
        MediaMetadata m = c.getMetadata();
        PlaybackState s = c.getPlaybackState();
        boolean isPlaying = playing(s);
        long actions = s == null ? 0 : s.getActions();

        // The card: the art and the words on top, the song's place under them (drag to seek), then the buttons.
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x26FFFFFF);
        bg.setCornerRadius(dp(18));
        card.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        root.addView(card, lp);

        Bitmap art = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (art == null) art = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (art == null) art = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        ImageView pic = new ImageView(a);
        pic.setScaleType(ImageView.ScaleType.CENTER_CROP);
        pic.setClipToOutline(true);
        GradientDrawable round = new GradientDrawable();
        round.setCornerRadius(dp(10));
        round.setColor(0x33FFFFFF);
        pic.setBackground(round);
        if (art != null) pic.setImageBitmap(art);
        else pic.setImageDrawable(appIcon(c.getPackageName()));
        LinearLayout top = new LinearLayout(a);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        card.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(dp(54), dp(54));
        pp.rightMargin = dp(12);
        top.addView(pic, pp);

        LinearLayout words = new LinearLayout(a);
        words.setOrientation(LinearLayout.VERTICAL);
        top.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView app = text(appName(c.getPackageName()).toUpperCase(), 10.5f, 0x99FFFFFF, false);
        app.setLetterSpacing(0.08f);
        words.addView(app);
        words.addView(text(m.getString(MediaMetadata.METADATA_KEY_TITLE), 15, Color.WHITE, true));
        String who = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (TextUtils.isEmpty(who)) who = m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        if (TextUtils.isEmpty(who)) who = m.getString(MediaMetadata.METADATA_KEY_ALBUM);
        if (!TextUtils.isEmpty(who)) words.addView(text(who, 13, 0xC0FFFFFF, false));

        MediaController.TransportControls t = c.getTransportControls();
        long length = m.getLong(MediaMetadata.METADATA_KEY_DURATION);
        // Seeking: when the app takes it (Spotify does), or always shown when it doesn't say (some apps leave their actions blank).
        boolean canSeek = length > 0 && (actions == 0 || (actions & PlaybackState.ACTION_SEEK_TO) != 0);
        if (length > 0) card.addView(seekRow(c, t, length, canSeek), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // The buttons: back 15 s, previous song, play / pause, next song, forward 15 s (the jumps only when it can seek).
        LinearLayout keys = new LinearLayout(a);
        keys.setOrientation(LinearLayout.HORIZONTAL);
        keys.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams kp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        kp.topMargin = dp(length > 0 ? 2 : 8);
        card.addView(keys, kp);
        if (canSeek) keys.addView(control(android.R.drawable.ic_media_rew, "Back 15 seconds", () -> jump(c, t, length, -JUMP_MS), false));
        keys.addView(control(android.R.drawable.ic_media_previous, "Previous song", t::skipToPrevious, false));
        keys.addView(control(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, isPlaying ? "Pause" : "Play",
            isPlaying ? t::pause : t::play, true));
        keys.addView(control(android.R.drawable.ic_media_next, "Next song", t::skipToNext, false));
        if (canSeek) keys.addView(control(android.R.drawable.ic_media_ff, "Forward 15 seconds", () -> jump(c, t, length, JUMP_MS), false));

        PendingIntent go = c.getSessionActivity();
        if (go != null) top.setOnClickListener(v -> open.accept(go)); // the art and the name open the app; the bar and buttons don't
        if (isPlaying && canSeek) ui.postDelayed(tick, 1000);
    }

    // ---- the song's place: a bar to drag, the time played and its length, moving on each second while it plays
    private static final long JUMP_MS = 15000;
    private SeekBar bar;
    private TextView played, total;
    private MediaController shown;
    private long shownLength;
    private boolean dragging, wanted; // dragging the bar; a redraw came while dragging (done when let go)

    /** Where the song is now: its last known place, moved on by the time since (at its speed) while it plays. */
    private static long now(PlaybackState s, long length) {
        if (s == null) return 0;
        long pos = s.getPosition();
        if (playing(s) && s.getState() == PlaybackState.STATE_PLAYING && s.getLastPositionUpdateTime() > 0) {
            pos += (long) ((android.os.SystemClock.elapsedRealtime() - s.getLastPositionUpdateTime()) * s.getPlaybackSpeed());
        }
        return Math.max(0, Math.min(length, pos));
    }

    private static String clock(long ms) {
        long sec = Math.max(0, ms / 1000);
        long h = sec / 3600, mm = (sec % 3600) / 60, ss = sec % 60;
        return h > 0 ? String.format(java.util.Locale.US, "%d:%02d:%02d", h, mm, ss) : String.format(java.util.Locale.US, "%d:%02d", mm, ss);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            ui.removeCallbacks(this);
            if (!started || shown == null || bar == null) return;
            PlaybackState s;
            try {
                s = shown.getPlaybackState();
            } catch (Exception e) {
                return;
            }
            if (!dragging) {
                long pos = now(s, shownLength);
                bar.setProgress((int) (pos / 1000));
                played.setText(clock(pos));
            }
            if (playing(s)) ui.postDelayed(this, 1000);
        }
    };

    private View seekRow(MediaController c, MediaController.TransportControls t, long length, boolean canSeek) {
        shown = c;
        shownLength = length;
        LinearLayout row = new LinearLayout(a);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, 0);
        long pos = now(c.getPlaybackState(), length);
        played = text(clock(pos), 11.5f, 0xB3FFFFFF, false);
        total = text(clock(length), 11.5f, 0xB3FFFFFF, false);
        bar = new SeekBar(a);
        bar.setMax((int) Math.max(1, length / 1000));
        bar.setProgress((int) (pos / 1000));
        bar.setEnabled(canSeek);
        bar.setContentDescription("Where the song is. Drag to move through it.");
        android.content.res.ColorStateList white = android.content.res.ColorStateList.valueOf(Color.WHITE);
        bar.setProgressTintList(white);
        bar.setThumbTintList(white);
        bar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0x55FFFFFF));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                if (fromUser) played.setText(clock(progress * 1000L));
            }

            @Override
            public void onStartTrackingTouch(SeekBar sb) {
                dragging = true;
            }

            @Override
            public void onStopTrackingTouch(SeekBar sb) {
                dragging = false;
                try {
                    t.seekTo(sb.getProgress() * 1000L);
                } catch (Exception ignored) {
                    // the app stopped meanwhile
                }
                if (wanted) {
                    wanted = false;
                    ui.post(NowPlaying.this::render);
                }
            }
        });
        row.addView(played);
        row.addView(bar, new LinearLayout.LayoutParams(0, dp(36), 1));
        row.addView(total);
        return row;
    }

    /** Back or forward a few seconds, within the song. */
    private void jump(MediaController c, MediaController.TransportControls t, long length, long by) {
        long to = Math.max(0, Math.min(length - 1000, now(c.getPlaybackState(), length) + by));
        t.seekTo(to);
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView v = new TextView(a);
        v.setText(s);
        v.setTextColor(color);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setSingleLine(true);
        v.setEllipsize(TextUtils.TruncateAt.END);
        return v;
    }

    /** One round button; the main one (play / pause) is filled. Pressing it doesn't open the app. */
    private View control(int icon, String label, Runnable act, boolean main) {
        ImageView b = new ImageView(a);
        b.setImageResource(icon);
        b.setContentDescription(label);
        b.setColorFilter(main ? Color.BLACK : Color.WHITE);
        b.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int pad = dp(main ? 9 : 8);
        b.setPadding(pad, pad, pad, pad);
        if (main) {
            GradientDrawable dot = new GradientDrawable();
            dot.setShape(GradientDrawable.OVAL);
            dot.setColor(Color.WHITE);
            b.setBackground(dot);
        }
        b.setOnClickListener(v -> {
            try {
                act.run();
            } catch (Exception ignored) {
                // the app stopped playing meanwhile
            }
        });
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(main ? 42 : 40), dp(main ? 42 : 40));
        p.leftMargin = dp(4);
        b.setLayoutParams(p);
        return b;
    }

    private String appName(String pkg) {
        try {
            PackageManager pm = a.getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (Exception e) {
            return "Now playing";
        }
    }

    private android.graphics.drawable.Drawable appIcon(String pkg) {
        try {
            return a.getPackageManager().getApplicationIcon(pkg);
        } catch (Exception e) {
            return null;
        }
    }
}
