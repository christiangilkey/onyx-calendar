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
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * What is playing (Spotify, YouTube Music, a podcast app...) for the Onyx panel over the lock screen:
 * the art, the song and artist, and previous / play-pause / next, as Android's own lock screen shows
 * it, under the Onyx panel and above the notifications. Reads the media sessions through Notification
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
        root.removeAllViews();
        if (!started) return;
        MediaController c = pick();
        if (c == null) return;
        MediaMetadata m = c.getMetadata();
        PlaybackState s = c.getPlaybackState();
        boolean isPlaying = playing(s);
        long actions = s == null ? 0 : s.getActions();

        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(12), dp(12), dp(10), dp(12));
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
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(dp(54), dp(54));
        pp.rightMargin = dp(12);
        card.addView(pic, pp);

        LinearLayout words = new LinearLayout(a);
        words.setOrientation(LinearLayout.VERTICAL);
        card.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView app = text(appName(c.getPackageName()).toUpperCase(), 10.5f, 0x99FFFFFF, false);
        app.setLetterSpacing(0.08f);
        words.addView(app);
        words.addView(text(m.getString(MediaMetadata.METADATA_KEY_TITLE), 15, Color.WHITE, true));
        String who = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (TextUtils.isEmpty(who)) who = m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        if (TextUtils.isEmpty(who)) who = m.getString(MediaMetadata.METADATA_KEY_ALBUM);
        if (!TextUtils.isEmpty(who)) words.addView(text(who, 13, 0xC0FFFFFF, false));

        MediaController.TransportControls t = c.getTransportControls();
        if ((actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0) card.addView(control(android.R.drawable.ic_media_previous, "Previous", t::skipToPrevious, false));
        card.addView(control(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, isPlaying ? "Pause" : "Play",
            isPlaying ? t::pause : t::play, true));
        if ((actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0) card.addView(control(android.R.drawable.ic_media_next, "Next", t::skipToNext, false));

        PendingIntent go = c.getSessionActivity();
        if (go != null) card.setOnClickListener(v -> open.accept(go));
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
