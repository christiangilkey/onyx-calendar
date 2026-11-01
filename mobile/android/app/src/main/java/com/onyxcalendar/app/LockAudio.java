package com.onyxcalendar.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

/**
 * An audio file from a lock screen shortcut, played right on the Onyx panel without unlocking: one at a
 * time, kept playing (by the app, not the panel) when the screen goes off, with a small player on the panel:
 * its name, play / pause, a bar to move through it, and × to stop.
 */
final class LockAudio {
    private static MediaPlayer player;
    private static String playing = ""; // the file's uri
    private static String name = "";
    private static boolean ready;
    private static AudioFocusRequest focus;
    private static Runnable changed;

    private LockAudio() {}

    /** Whether a shortcut is an audio file, to play here rather than unlock and open it. */
    static boolean isAudio(org.json.JSONObject s) {
        if (!"file".equals(s.optString("kind"))) return false;
        String type = s.optString("type", "");
        if (!type.isEmpty() && !type.equals("application/octet-stream")) return type.startsWith("audio/");
        return s.optString("name", "").toLowerCase(java.util.Locale.ROOT).matches(".*\\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|amr|mid|midi)$");
    }

    /** Plays it, from the start (or carries on, when it is the one already loaded). */
    static void play(Context ctx, org.json.JSONObject s) {
        Context app = ctx.getApplicationContext();
        String uri = s.optString("target");
        if (player != null && uri.equals(playing)) {
            if (ready && !player.isPlaying()) start(app);
            notifyChanged();
            return;
        }
        stop(app);
        playing = uri;
        String label = s.optString("label", "").trim();
        name = !label.isEmpty() ? label : s.optString("name", "Audio");
        MediaPlayer p = new MediaPlayer();
        player = p;
        try {
            p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            p.setWakeMode(app, PowerManager.PARTIAL_WAKE_LOCK);
            p.setDataSource(app, Uri.parse(uri));
            p.setOnPreparedListener(mp -> {
                if (mp != player) return;
                ready = true;
                start(app);
                notifyChanged();
            });
            p.setOnCompletionListener(mp -> {
                if (mp != player) return;
                abandon(app);
                notifyChanged();
            });
            p.setOnErrorListener((mp, what, extra) -> {
                if (mp == player) stop(app);
                notifyChanged();
                return true;
            });
            p.prepareAsync();
        } catch (Exception e) {
            stop(app);
            android.widget.Toast.makeText(app, "Can't play " + name + ".", android.widget.Toast.LENGTH_LONG).show();
        }
        notifyChanged();
    }

    private static void start(Context app) {
        AudioManager am = app.getSystemService(AudioManager.class);
        if (am != null && Build.VERSION.SDK_INT >= 26) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
                .setOnAudioFocusChangeListener((change) -> {
                    // Something else started playing (music, a call): pause, as players do.
                    if (change < 0 && player != null && player.isPlaying()) {
                        player.pause();
                        notifyChanged();
                    }
                })
                .build();
            am.requestAudioFocus(focus);
        }
        player.start();
    }

    private static void abandon(Context app) {
        AudioManager am = app.getSystemService(AudioManager.class);
        if (am != null && focus != null && Build.VERSION.SDK_INT >= 26) am.abandonAudioFocusRequest(focus);
        focus = null;
    }

    static void toggle(Context ctx) {
        if (player == null || !ready) return;
        if (player.isPlaying()) {
            player.pause();
            abandon(ctx.getApplicationContext());
        } else {
            start(ctx.getApplicationContext());
        }
        notifyChanged();
    }

    static void stop(Context ctx) {
        if (player != null) {
            try {
                player.release();
            } catch (Exception ignored) {
                // already gone
            }
        }
        player = null;
        ready = false;
        playing = "";
        abandon(ctx.getApplicationContext());
        notifyChanged();
    }

    private static void notifyChanged() {
        if (changed != null) changed.run();
    }

    // ------------------------------------------------------------ the player on the panel

    /** The player card; call update() to show where it is (each second while the panel shows). */
    static final class Card {
        final LinearLayout root;
        private final Context ctx;
        private final TextView title, time;
        private final ImageView play;
        private final SeekBar bar;
        private boolean dragging;

        Card(Context ctx) {
            this.ctx = ctx;
            root = new LinearLayout(ctx);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setPadding(dp(14), dp(10), dp(10), dp(8));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(0x26FFFFFF);
            bg.setCornerRadius(dp(18));
            root.setBackground(bg);

            LinearLayout top = new LinearLayout(ctx);
            top.setGravity(Gravity.CENTER_VERTICAL);
            root.addView(top);
            title = new TextView(ctx);
            title.setTextColor(Color.WHITE);
            title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            title.setTypeface(Typeface.DEFAULT_BOLD);
            title.setSingleLine(true);
            title.setEllipsize(TextUtils.TruncateAt.END);
            top.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            play = button(android.R.drawable.ic_media_play, "Play or pause");
            play.setOnClickListener(v -> toggle(ctx));
            top.addView(play);
            ImageView close = button(android.R.drawable.ic_menu_close_clear_cancel, "Stop");
            close.setOnClickListener(v -> stop(ctx));
            top.addView(close);

            LinearLayout bottom = new LinearLayout(ctx);
            bottom.setGravity(Gravity.CENTER_VERTICAL);
            root.addView(bottom);
            bar = new SeekBar(ctx);
            bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar s, int at, boolean byUser) {
                    if (byUser) time.setText(clock(at) + " / " + clock(s.getMax()));
                }

                @Override
                public void onStartTrackingTouch(SeekBar s) {
                    dragging = true;
                }

                @Override
                public void onStopTrackingTouch(SeekBar s) {
                    dragging = false;
                    if (player != null && ready) player.seekTo(s.getProgress());
                    update();
                }
            });
            bottom.addView(bar, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            time = new TextView(ctx);
            time.setTextColor(0xB3FFFFFF);
            time.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            bottom.addView(time);
            update();
        }

        /** Shows it while something is loaded, gone otherwise. Also called when it changes. */
        void update() {
            if (player == null) {
                root.setVisibility(View.GONE);
                return;
            }
            root.setVisibility(View.VISIBLE);
            title.setText(name);
            boolean on = ready && player.isPlaying();
            play.setImageResource(on ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
            if (!ready) {
                time.setText("Loading…");
                return;
            }
            int total = Math.max(0, player.getDuration()), at = player.getCurrentPosition();
            bar.setMax(total);
            if (!dragging) {
                bar.setProgress(at);
                time.setText(clock(at) + " / " + clock(total));
            }
        }

        /** Keeps the card up to date while the panel shows; null when it goes. */
        void watch(Runnable onChange) {
            changed = onChange;
        }

        private ImageView button(int res, String label) {
            ImageView b = new ImageView(ctx);
            b.setImageResource(res);
            b.setColorFilter(Color.WHITE);
            b.setContentDescription(label);
            b.setPadding(dp(10), dp(8), dp(10), dp(8));
            return b;
        }

        private int dp(float v) {
            return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
        }
    }

    private static String clock(int ms) {
        int s = Math.max(0, ms / 1000);
        return s >= 3600 ? String.format(java.util.Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
            : String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60);
    }
}
