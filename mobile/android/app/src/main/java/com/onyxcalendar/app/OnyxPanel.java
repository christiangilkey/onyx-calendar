package com.onyxcalendar.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * The Onyx part of the home screen and the lock screen: what is on now (with how far
 * through it you are), what is next and how long until it, the Pi's call when it rings,
 * the goals' progress bars and the rest of today. Built in code from LauncherData; tick()
 * moves the countdowns and bars along every second, render() rebuilds it.
 */
final class OnyxPanel {
    interface Host {
        /** Opens the Onyx app on a day ("2026-10-17"), or where it was. */
        void openOnyx(String day);

        /** "Leaving now" on a call. */
        void acknowledge(LauncherData.Item item);
    }

    static final int TEXT = 0xFFF4F4F6, MUTED = 0xFFA4A8B4, FAINT = 0xFF6E7380;
    static final int CARD = 0xD914161C, AMBER = 0xFFF5B83D, GREEN = 0xFF5FD38D, ACCENT = 0xFF8B7CF6;
    static final int WORK = 0xFFFF6B5B, BREAK = 0xFF4FD1A5; // pomodoro: work and break

    final LinearLayout root;
    /** The Pi's call as it rings: placed above everything (above the Hyperfocus scene too). */
    final LinearLayout top;
    private final Context ctx;
    private final Host host;
    private final boolean big;

    // what tick() keeps moving
    private LauncherData.Item now, next, calling;
    private LauncherData.Focus focus; // a Hyperfocus session: the scene above shows it, this shows the rest of the day
    private TextView nowLeft, nextIn, leaveIn, callIn, pomoLine;
    private BarView nowBar;
    private long renderedFor; // the minute the cards were built for

    OnyxPanel(Context ctx, Host host, boolean big) {
        this.ctx = ctx;
        this.host = host;
        this.big = big;
        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        top = new LinearLayout(ctx);
        top.setOrientation(LinearLayout.VERTICAL);
    }

    int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }

    private String clock(long ms) {
        String pattern = DateFormat.is24HourFormat(ctx) ? "H:mm" : "h:mm a";
        return new SimpleDateFormat(pattern, Locale.getDefault()).format(new Date(ms));
    }

    /** "2h 05m", "48m 12s", "12s". */
    static String span(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        if (h > 0) return h + "h " + String.format(Locale.US, "%02d", m) + "m";
        if (m > 0) return m + "m " + String.format(Locale.US, "%02d", sec) + "s";
        return sec + "s";
    }

    // ------------------------------------------------------------ building blocks

    private LinearLayout card(int color) {
        LinearLayout c = new LinearLayout(ctx);
        c.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(20));
        c.setBackground(bg);
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        c.setLayoutParams(lp);
        return c;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(ctx);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        t.setShadowLayer(dp(2), 0, 0, 0x66000000);
        return t;
    }

    private TextView label(String s, int color) {
        TextView t = text(s.toUpperCase(Locale.getDefault()), 11, color, true);
        t.setLetterSpacing(0.12f);
        return t;
    }

    private TextView title(String s) {
        TextView t = text(s, big ? 22 : 19, TEXT, true);
        t.setMaxLines(2);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setPadding(0, dp(3), 0, dp(2));
        return t;
    }

    private BarView bar(int color, float progress, int heightDp) {
        BarView b = new BarView(ctx);
        b.setColor(color);
        b.setProgress(progress);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(heightDp));
        lp.topMargin = dp(6);
        lp.bottomMargin = dp(4);
        b.setLayoutParams(lp);
        return b;
    }

    private TextView button(String s, boolean primary, View.OnClickListener onClick) {
        TextView b = text(s, 14, primary ? 0xFF1A1206 : TEXT, true);
        b.setShadowLayer(0, 0, 0, 0);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(16), dp(10), dp(16), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(primary ? AMBER : 0x33FFFFFF);
        bg.setCornerRadius(dp(999));
        b.setBackground(bg);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        lp.rightMargin = dp(8);
        b.setLayoutParams(lp);
        return b;
    }

    private View divider() {
        View v = new View(ctx);
        v.setBackgroundColor(0x1FFFFFFF);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, dp(0.7f)));
        lp.topMargin = dp(12);
        lp.bottomMargin = dp(10);
        v.setLayoutParams(lp);
        return v;
    }

    // ------------------------------------------------------------ the cards

    void render() {
        long t = System.currentTimeMillis();
        renderedFor = t / LauncherData.MIN;
        root.removeAllViews();
        top.removeAllViews();
        nowLeft = nextIn = leaveIn = callIn = null;
        nowBar = null;
        focus = LauncherData.focus(ctx);
        List<LauncherData.Item> items = LauncherData.items(ctx);
        now = LauncherData.now(items, t);
        next = LauncherData.next(items, t);
        calling = LauncherData.calling(items, t);

        if (calling != null) top.addView(callCard(calling, t));
        if (focus != null) {
            // Under the Hyperfocus scene: the rest of the day, quieter (what is on now is the scene itself).
            TextView rest = label("Rest of today", FAINT);
            rest.setPadding(dp(4), dp(6), 0, dp(8));
            root.addView(rest);
        }
        root.addView(nowNextCard(items, t));
        List<LauncherData.Goal> goals = LauncherData.goals(ctx);
        if (!goals.isEmpty()) root.addView(goalsCard(goals));
        root.addView(dayCard(items, t));

        String error = LauncherData.error(ctx);
        long updated = LauncherData.updated(ctx);
        String foot = !error.isEmpty() ? error + (updated > 0 ? "  ·  from " + clock(updated) : "")
            : updated > 0 ? "Updated " + clock(updated) : "Loading from your PC…";
        TextView f = text(foot, 11, FAINT, false);
        f.setGravity(Gravity.CENTER);
        f.setPadding(0, 0, 0, dp(6));
        f.setOnClickListener(v -> host.openOnyx(null));
        root.addView(f);
        tick();
    }

    private View callCard(LauncherData.Item it, long t) {
        LauncherData.Alert a = it.calling(t);
        boolean push = a != null && "push".equals(a.kind);
        LinearLayout c = card(0xEB2A1C0C);
        ((GradientDrawable) c.getBackground()).setStroke(dp(1.5f), AMBER);
        c.addView(label(push ? "Reminder from the Pi" : a != null && "alarm".equals(a.kind) ? "Alarm" : "The Pi is calling", AMBER));
        c.addView(title(it.title));
        callIn = text("", 14, 0xFFF7D9A0, false);
        c.addView(callIn);
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(10), 0, 0);
        row.addView(button("task".equals(it.kind) ? "Done" : "Leaving now", true, v -> host.acknowledge(it)));
        row.addView(button("Open", false, v -> host.openOnyx(LauncherData.dayOf(it.start).toString())));
        c.addView(row);
        return c;
    }

    private View nowNextCard(List<LauncherData.Item> items, long t) {
        LinearLayout c = card(CARD);
        c.setOnClickListener(v -> host.openOnyx(LocalDate.now().toString()));
        if (focus != null) {
            if (now != null && !now.title.equals(focus.goal)) {
                TextView on = text("Now  ·  " + now.title + "  ·  until " + clock(now.end), 13, MUTED, false);
                on.setSingleLine(true);
                on.setEllipsize(TextUtils.TruncateAt.END);
                on.setPadding(0, 0, 0, dp(8));
                c.addView(on);
            }
        } else if (now != null) {
            c.addView(label("● Now", GREEN));
            c.addView(title(now.title));
            // A pomodoro block: the phase in big, red for work, green for a break.
            pomoLine = text("", big ? 22 : 19, TEXT, true);
            pomoLine.setPadding(0, dp(4), 0, 0);
            c.addView(pomoLine);
            nowBar = bar(now.colorInt(ACCENT), 0, big ? 12 : 10);
            c.addView(nowBar);
            nowLeft = text("", 13, MUTED, false);
            c.addView(nowLeft);
        } else {
            c.addView(label("Now", MUTED));
            c.addView(title("Free"));
            nowLeft = text("", 13, MUTED, false);
            c.addView(nowLeft);
        }
        if (focus == null) c.addView(divider());
        if (next != null) {
            boolean today = LauncherData.dayOf(next.start).equals(LocalDate.now());
            c.addView(label(today ? "Next" : "Next · tomorrow", ACCENT));
            c.addView(title(next.title));
            nextIn = text("", big ? 17 : 15, TEXT, true);
            c.addView(nextIn);
            if (next.leaveAt() > 0) {
                leaveIn = text("", 13, AMBER, false);
                c.addView(leaveIn);
            }
        } else {
            c.addView(label("Next", MUTED));
            TextView none = text("Nothing else today or tomorrow", 15, MUTED, false);
            none.setPadding(0, dp(3), 0, 0);
            c.addView(none);
        }
        LauncherData.Item coming = LauncherData.callComing(items, t);
        if (coming != null && coming != calling) {
            LauncherData.Alert a = coming.coming(t);
            String what = "push".equals(a.kind) ? "The Pi reminds you at " : "alarm".equals(a.kind) ? "Your alarm rings at " : "The Pi calls at ";
            TextView call = text(what + clock(a.at) + (coming == next ? "" : " about " + coming.title), 13, AMBER, false);
            call.setPadding(0, dp(4), 0, 0);
            c.addView(call);
        }
        return c;
    }

    private View goalsCard(List<LauncherData.Goal> goals) {
        LinearLayout c = card(CARD);
        c.setOnClickListener(v -> host.openOnyx(null));
        c.addView(label("Goals", MUTED));
        int shown = 0;
        for (LauncherData.Goal g : goals) {
            if (shown++ == 4) break;
            LinearLayout row = new LinearLayout(ctx);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setPadding(0, dp(8), 0, 0);
            TextView name = text(g.title, 14, TEXT, false);
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            name.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            row.addView(name);
            row.addView(text(g.percent + "%", 14, MUTED, true));
            c.addView(row);
            BarView b = bar(g.colorInt(ACCENT), g.percent / 100f, 6);
            ((LinearLayout.LayoutParams) b.getLayoutParams()).topMargin = dp(4);
            c.addView(b);
        }
        return c;
    }

    private View dayCard(List<LauncherData.Item> items, long t) {
        LinearLayout c = card(CARD);
        LocalDate today = LocalDate.now();
        String date = new SimpleDateFormat("EEE, MMM d", Locale.getDefault()).format(new Date(t));
        c.addView(label("Today · " + date, MUTED));
        int rows = 0;
        for (LauncherData.Item it : items) {
            if (!LauncherData.dayOf(it.start).equals(today) || (!it.allDay && it.end <= t)) continue;
            if (rows++ == 7) break;
            c.addView(row(it, t));
        }
        if (rows == 0) {
            TextView none = text("Nothing else today", 14, MUTED, false);
            none.setPadding(0, dp(6), 0, 0);
            c.addView(none);
        }
        int tomorrow = 0;
        for (LauncherData.Item it : items) {
            if (!LauncherData.dayOf(it.start).equals(today.plusDays(1))) continue;
            if (tomorrow == 0) {
                TextView l = label("Tomorrow", FAINT);
                l.setPadding(0, dp(12), 0, 0);
                c.addView(l);
            }
            if (tomorrow++ == 3) break;
            c.addView(row(it, t));
        }
        return c;
    }

    private View row(LauncherData.Item it, long t) {
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(7), 0, dp(1));
        row.setOnClickListener(v -> host.openOnyx(LauncherData.dayOf(it.start).toString()));
        View dot = new View(ctx);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(it.colorInt(ACCENT));
        dot.setBackground(d);
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(dp(8), dp(8));
        dl.rightMargin = dp(10);
        dot.setLayoutParams(dl);
        row.addView(dot);
        TextView when = text(it.allDay ? "All day" : clock(it.start), 13, MUTED, false);
        when.setLayoutParams(new LinearLayout.LayoutParams(dp(big ? 78 : 70), LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(when);
        TextView name = text(it.title, 14, it.done ? FAINT : TEXT, false);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        if (it.done) name.setPaintFlags(name.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG);
        name.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        row.addView(name);
        if (it == now) row.addView(text("now", 12, GREEN, true));
        else if (!it.alerts.isEmpty() && !it.ack && !it.done) row.addView(text("📞", 12, AMBER, false));
        return row;
    }

    // ------------------------------------------------------------ every second

    /** Moves the countdowns and the bar along. Returns true when the cards need building again. */
    boolean tick() {
        long t = System.currentTimeMillis();
        if (now != null && t >= now.end) return true;
        if (next != null && t >= next.start) return true;
        if (calling != null && calling.calling(t) == null) return true;
        if (focus != null && t >= focus.end) return true;
        if (now != null && nowBar != null) {
            long[] ph = now.phase(t);
            if (ph != null) {
                boolean work = ph[0] == 1;
                int color = work ? WORK : BREAK;
                pomoLine.setVisibility(View.VISIBLE);
                pomoLine.setTextColor(color);
                pomoLine.setText((work ? "WORK  " : "BREAK  ") + span(ph[1]) + "  ·  round " + ph[3] + " of " + ph[4]);
                nowBar.setColor(color);
                nowBar.setProgress(1f - (float) ph[1] / Math.max(1, ph[2]));
                if (nowLeft != null) nowLeft.setText("Block: " + span(now.end - t) + " left  ·  until " + clock(now.end));
            } else {
                if (pomoLine != null) pomoLine.setVisibility(View.GONE);
                nowBar.setColor(now.colorInt(ACCENT));
                float p = (float) (t - now.start) / Math.max(1, now.end - now.start);
                nowBar.setProgress(p);
                if (nowLeft != null) nowLeft.setText(span(now.end - t) + " left  ·  until " + clock(now.end));
            }
        } else if (nowLeft != null) {
            nowLeft.setText(next != null ? "Free for " + span(next.start - t) : "Nothing on");
        }
        if (next != null && nextIn != null) nextIn.setText("in " + span(next.start - t) + "  ·  " + clock(next.start));
        if (next != null && leaveIn != null) {
            long leave = next.leaveAt();
            leaveIn.setText(leave > t ? "Leave by " + clock(leave) + "  ·  in " + span(leave - t) : "Time to leave (by " + clock(leave) + ")");
        }
        if (calling != null && callIn != null) {
            long leave = calling.leaveAt();
            String s = "Starts " + clock(calling.start) + " (in " + span(calling.start - t) + ")";
            if (leave > 0) s += leave > t ? "  ·  leave by " + clock(leave) : "  ·  time to leave";
            callIn.setText(s);
        }
        // A new minute can bring a coming call into range.
        return t / LauncherData.MIN != renderedFor && t / LauncherData.MIN % 5 == 0;
    }

    // ------------------------------------------------------------ a progress bar

    static final class BarView extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF();
        private float progress;

        BarView(Context ctx) {
            super(ctx);
            track.setColor(0x2EFFFFFF);
            fill.setColor(ACCENT);
        }

        void setColor(int color) {
            fill.setColor(color | 0xFF000000);
            invalidate();
        }

        void setProgress(float p) {
            p = Math.max(0f, Math.min(1f, p));
            if (p != progress) {
                progress = p;
                invalidate();
            }
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float h = getHeight(), w = getWidth(), rad = h / 2f;
            r.set(0, 0, w, h);
            canvas.drawRoundRect(r, rad, rad, track);
            if (progress > 0) {
                r.set(0, 0, Math.max(h, w * progress), h);
                canvas.drawRoundRect(r, rad, rad, fill);
            }
        }
    }
}
