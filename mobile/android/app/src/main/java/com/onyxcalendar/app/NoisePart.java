package com.onyxcalendar.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The Noise machine part, on the lock screen and Onyx Home (added in the app: Settings, Home and lock screen):
 * one card with a round play / stop button, the sound and its timer, and a button for the next sound. Nothing
 * here unlocks the phone. It plays on through NoiseService, with the screen off, until stopped.
 */
final class NoisePart {
    final LinearLayout root;
    private final Context ctx;
    private final TextView play, sound, label;
    private final Runnable changed = this::update;

    NoisePart(Context ctx) {
        this.ctx = ctx;
        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(dp(10), dp(9), dp(8), dp(9));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x26FFFFFF);
        bg.setCornerRadius(dp(18));
        root.setBackground(bg);

        play = new TextView(ctx);
        play.setGravity(Gravity.CENTER);
        play.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(Color.WHITE);
        play.setBackground(dot);
        play.setTextColor(Color.BLACK);
        root.addView(play, new LinearLayout.LayoutParams(dp(42), dp(42)));

        LinearLayout words = new LinearLayout(ctx);
        words.setOrientation(LinearLayout.VERTICAL);
        words.setPadding(dp(12), 0, dp(8), 0);
        label = new TextView(ctx);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        label.setTextColor(0xB3FFFFFF);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setLetterSpacing(0.08f);
        words.addView(label);
        sound = new TextView(ctx);
        sound.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        sound.setTextColor(Color.WHITE);
        sound.setTypeface(Typeface.DEFAULT_BOLD);
        sound.setSingleLine(true);
        sound.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(sound);
        root.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        TextView next = new TextView(ctx);
        next.setText("Next ›");
        next.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        next.setTextColor(Color.WHITE);
        next.setGravity(Gravity.CENTER);
        next.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(0x26FFFFFF);
        pill.setCornerRadius(dp(999));
        next.setBackground(pill);
        next.setContentDescription("Next sound");
        next.setOnClickListener(v -> NoiseService.next(ctx));
        root.addView(next);

        play.setOnClickListener(v -> NoiseService.toggle(ctx));
        root.setOnClickListener(v -> NoiseService.toggle(ctx));
        update();
    }

    /** Kept up to date while the screen shows (from the app, the notification, or here). */
    void start() {
        NoiseService.watch(changed);
        update();
    }

    void stop() {
        NoiseService.unwatch(changed);
    }

    void update() {
        boolean on = NoiseService.playing();
        play.setText(on ? "■" : "▶︎"); // as text, not the coloured emoji
        play.setContentDescription(on ? "Stop the noise machine" : "Play the noise machine");
        long end = NoiseService.endsAt();
        label.setText(on ? (end > 0 ? "PLAYING · UNTIL " + DateFormat.getTimeFormat(ctx).format(new java.util.Date(end)) : "PLAYING") : "NOISE MACHINE");
        sound.setText(NoiseService.name(NoiseService.kind(ctx)));
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }
}
