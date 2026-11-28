package com.onyxcalendar.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.function.Consumer;

/**
 * Two lock-screen parts (1.145.0), each moved and switched on in the app's lock screen editor:
 * <ul>
 *   <li><b>plan</b>: today's plan from last night's after-action review (aar.js), one tap from the
 *   whole review. From 7 pm, with no review written today, it asks for one instead.</li>
 *   <li><b>unstick</b>: for when you know what to do and can't start. Unstick opens the kit, and
 *   "Don't make me choose" goes straight to its three steps.</li>
 * </ul>
 * Each tap unlocks first, then opens Onyx there (onyx://open?view=aar|unstick).
 */
final class ReviewParts {
    private static final int GREEN = 0xFF5FD38D, ORANGE = 0xFFFF7B3A, AMBER = 0xFFF5B83D;
    private static final int EVENING = 19;

    private final Context ctx;
    private final Consumer<String> open; // the link's query, e.g. "view=aar&date=2026-11-26"
    final LinearLayout plan, unstick;
    private final TextView planHead, planText, planFoot;

    ReviewParts(Context ctx, Consumer<String> open) {
        this.ctx = ctx;
        this.open = open;

        plan = card(0x26FFFFFF);
        planHead = text(11, GREEN, true);
        planHead.setLetterSpacing(0.1f);
        planText = text(16, Color.WHITE, false);
        planText.setMaxLines(5);
        planText.setEllipsize(TextUtils.TruncateAt.END);
        planText.setLineSpacing(0, 1.15f);
        planFoot = text(12, 0x99FFFFFF, false);
        plan.addView(planHead);
        plan.addView(planText, margins(0, 4, 0, 0));
        plan.addView(planFoot, margins(0, 6, 0, 0));

        unstick = new LinearLayout(ctx);
        unstick.setOrientation(LinearLayout.HORIZONTAL);
        TextView main = pill("⚡  Unstick", ORANGE, 0xFF1A0C04);
        main.setOnClickListener(v -> open.accept("view=unstick"));
        TextView rescue = pill("Don't make me choose", 0x33FF7B3A, 0xFFFFD2BC);
        rescue.setOnClickListener(v -> open.accept("view=unstick&state=rescue"));
        LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.4f);
        b.leftMargin = dp(8);
        unstick.addView(main, a);
        unstick.addView(rescue, b);
        unstick.setPadding(0, dp(10), 0, 0);
    }

    /** Drawn again each time the panel shows: the plan from the PC's last answer (LauncherData.fetch). */
    void render() {
        JSONObject data = LauncherData.cached(ctx);
        LocalDate today = LocalDate.now();
        JSONObject aar = today.toString().equals(data.optString("day")) ? data.optJSONObject("aar") : null;
        JSONObject yesterday = aar != null ? aar.optJSONObject("yesterday") : null;
        JSONObject mine = aar != null ? aar.optJSONObject("today") : null;
        String planned = yesterday != null ? yesterday.optString("plan", "").trim() : "";
        // Proof of starts (1.146.0, proof.js): "Showed up 6 of the last 7 days · 23 done".
        JSONObject proof = today.toString().equals(data.optString("day")) ? data.optJSONObject("proof") : null;
        String record = proof != null ? proof.optString("line", "") : "";
        boolean evening = LocalTime.now().getHour() >= EVENING;
        if (evening && mine == null) {
            planHead.setText("TONIGHT'S REVIEW");
            planHead.setTextColor(AMBER);
            planText.setText("What did I do? What could go better? Plan for tomorrow.");
            planFoot.setText(record.isEmpty() ? "Tap to write it" : record + "\nTap to write it");
            plan.setOnClickListener(v -> open.accept("view=aar&date=" + today));
            plan.setVisibility(View.VISIBLE);
        } else if (!planned.isEmpty()) {
            planHead.setText("TODAY'S PLAN");
            planHead.setTextColor(GREEN);
            planText.setText(planned);
            planFoot.setText(record.isEmpty() ? "From last night's review  ·  tap to open it" : record);
            plan.setOnClickListener(v -> open.accept("view=aar&date=" + today.minusDays(1)));
            plan.setVisibility(View.VISIBLE);
        } else if (!record.isEmpty() && proof.optInt("showedUp", 0) > 0) {
            planHead.setText("YOUR PROOF");
            planHead.setTextColor(GREEN);
            planText.setText(record);
            planFoot.setText("Tap for today's review");
            plan.setOnClickListener(v -> open.accept("view=aar&date=" + today));
            plan.setVisibility(View.VISIBLE);
        } else {
            plan.setVisibility(View.GONE); // nothing planned, nothing yet on record: no empty card
        }
    }

    // ---- small builders

    private LinearLayout card(int color) {
        LinearLayout c = new LinearLayout(ctx);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(20));
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        c.setLayoutParams(lp);
        return c;
    }

    private TextView pill(String label, int bg, int fg) {
        TextView t = new TextView(ctx);
        t.setText(label);
        t.setTextColor(fg);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setPadding(dp(14), dp(13), dp(14), dp(13));
        GradientDrawable d = new GradientDrawable();
        d.setColor(bg);
        d.setCornerRadius(dp(999));
        t.setBackground(d);
        return t;
    }

    private TextView text(float sp, int color, boolean bold) {
        TextView t = new TextView(ctx);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private LinearLayout.LayoutParams margins(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }
}
