package com.onyxcalendar.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The Onyx home-screen widget: your calendar, at any size.
 *
 *   small (one row)   what is next
 *   medium            a day's agenda (‹ › to step through days)
 *   tall              the agenda for the week
 *   4×4 and up        the month (dots on busy days) and the picked day's agenda
 *
 * Tapping an entry opens it in the app; ✓ ticks a task off.
 */
public class OnyxWidget extends AppWidgetProvider {
    static final String ACTION = "com.onyxcalendar.app.WIDGET";
    static final String EXTRA_DO = "do";
    static final String EXTRA_TASK = "task";
    static final String EXTRA_DATE = "date";

    // ------------------------------------------------------------ Android's calls

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
        refreshInBackground(ctx, null);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        render(ctx, mgr, id); // resized: the layout follows the size
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        for (int id : ids) WidgetData.forget(ctx, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (!ACTION.equals(intent.getAction())) return;
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        String what = intent.getStringExtra(EXTRA_DO);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID || what == null) return;
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        switch (what) {
            case "prev":
            case "next":
            case "today": {
                int offset = "today".equals(what) ? 0 : WidgetData.dayOffset(ctx, id) + ("next".equals(what) ? 1 : -1);
                WidgetData.setDayOffset(ctx, id, offset);
                render(ctx, mgr, id);
                if (!covers(ctx, LocalDate.now().plusDays(offset))) refreshInBackground(ctx, LocalDate.now().plusDays(offset));
                break;
            }
            case "pick": {
                // A day tapped in the month: its agenda shows below.
                String date = intent.getStringExtra(EXTRA_DATE);
                if (date == null) break;
                LocalDate day = LocalDate.parse(date);
                WidgetData.setDayOffset(ctx, id, (int) ChronoUnit.DAYS.between(LocalDate.now(), day));
                render(ctx, mgr, id);
                if (!coversMonth(ctx, day)) refreshInBackground(ctx, day);
                break;
            }
            case "prevMonth":
            case "nextMonth": {
                // The 1st of the month before or after, or today when that is this month.
                LocalDate shown = LocalDate.now().plusDays(WidgetData.dayOffset(ctx, id));
                LocalDate first = shown.withDayOfMonth(1).plusMonths("nextMonth".equals(what) ? 1 : -1);
                LocalDate today = LocalDate.now();
                LocalDate day = first.getMonth() == today.getMonth() && first.getYear() == today.getYear() ? today : first;
                WidgetData.setDayOffset(ctx, id, (int) ChronoUnit.DAYS.between(today, day));
                render(ctx, mgr, id);
                if (!coversMonth(ctx, day)) refreshInBackground(ctx, day);
                break;
            }
            case "refresh":
                refreshInBackground(ctx, LocalDate.now().plusDays(WidgetData.dayOffset(ctx, id)));
                break;
            default:
                break;
        }
    }

    /** Ticks a task off on the PC, then fetches again and redraws (a row's ✓). */
    static void completeInBackground(Context ctx, int id, String task) {
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                WidgetData.completeTask(app, task);
                WidgetData.fetch(app, LocalDate.now().plusDays(WidgetData.dayOffset(app, id)));
            } catch (Exception e) {
                WidgetData.prefs(app).edit().putString("error", e.getMessage()).apply();
            }
            renderAll(app);
        }).start();
    }

    // ------------------------------------------------------------ keeping it current

    /** Whether the kept data covers `day` (it holds a week from its start). */
    private static boolean covers(Context ctx, LocalDate day) {
        String start = WidgetData.cached(ctx).optString("start", "");
        if (start.isEmpty()) return false;
        LocalDate s = LocalDate.parse(start);
        return !day.isBefore(s) && day.isBefore(s.plusDays(WidgetData.WINDOW));
    }

    /** Whether the kept data covers the whole month grid around `day`. */
    private static boolean coversMonth(Context ctx, LocalDate day) {
        LocalDate first = WidgetData.gridStart(day);
        return covers(ctx, first) && covers(ctx, first.plusDays(41));
    }

    /** Fetches from the PC off the main thread, then redraws every Onyx widget. */
    void refreshInBackground(Context ctx, LocalDate start) {
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            WidgetData.fetch(app, start != null ? start : LocalDate.now());
            renderAll(app);
        }).start();
    }

    /** Redraws every Onyx widget on the home screen. */
    static void renderAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        OnyxWidget widget = new OnyxWidget();
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, OnyxWidget.class))) widget.render(ctx, mgr, id);
    }

    /** Asks the widgets to fetch again (the app calls this after a change). */
    static void refreshAll(Context ctx) {
        new OnyxWidget().refreshInBackground(ctx, null);
    }

    // ------------------------------------------------------------ drawing

    void render(Context ctx, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        // Portrait: the narrowest width and the tallest height Android gives the widget.
        int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 180);
        if (w <= 0) w = 250;
        if (h <= 0) h = 180;
        boolean small = h < 100 || w < 150;
        boolean month = !small && h >= 320 && w >= 250; // 4×4 and up
        JSONObject data = WidgetData.cached(ctx);
        RemoteViews views = small ? renderSmall(ctx, data) : month ? renderMonth(ctx, id, data, h) : renderFull(ctx, id, h);
        mgr.updateAppWidget(id, views);
        if (!small) mgr.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
    }

    private RemoteViews renderSmall(Context ctx, JSONObject data) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_small);
        WidgetItems.Item next = WidgetItems.next(WidgetItems.agenda(data));
        if (next == null) {
            v.setTextViewText(R.id.widget_small_title, WidgetData.paired(ctx) ? "Nothing else today" : "Open Onyx to pair");
            v.setTextViewText(R.id.widget_small_meta, status(ctx));
            v.setInt(R.id.widget_small_bar, "setBackgroundColor", 0xFF4B4B53);
        } else {
            v.setTextViewText(R.id.widget_small_title, next.title);
            v.setTextViewText(R.id.widget_small_meta, whenText(next));
            v.setInt(R.id.widget_small_bar, "setBackgroundColor", next.color);
        }
        v.setOnClickPendingIntent(R.id.widget_small_body, open(ctx, "calendar", next != null ? next.day.toString() : null, 2));
        return v;
    }

    private RemoteViews renderFull(Context ctx, int id, int h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_onyx);
        v.setOnClickPendingIntent(R.id.widget_refresh, action(ctx, id, "refresh", 2));
        v.setOnClickPendingIntent(R.id.widget_open, open(ctx, "calendar", null, 3));
        v.setTextViewText(R.id.widget_status, status(ctx));

        int offset = WidgetData.dayOffset(ctx, id);
        LocalDate day = LocalDate.now().plusDays(offset);
        int days = h >= 260 ? WidgetData.WEEK : 1; // tall widgets show the week
        v.setOnClickPendingIntent(R.id.widget_prev, action(ctx, id, "prev", 4));
        v.setOnClickPendingIntent(R.id.widget_next, action(ctx, id, "next", 5));
        v.setOnClickPendingIntent(R.id.widget_title, action(ctx, id, "today", 6));
        v.setTextViewText(R.id.widget_title, dayName(day));
        v.setTextViewText(R.id.widget_subtitle, days > 1 ? "and the week ahead" : day.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)));

        bindList(ctx, v, id, day, days);
        return v;
    }

    /** The agenda list below the header: `days` days from `day`, rows open the day or tick a task. */
    private static void bindList(Context ctx, RemoteViews v, int id, LocalDate day, int days) {
        Intent service = new Intent(ctx, OnyxWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        service.putExtra(OnyxWidgetService.EXTRA_DAY, day.toString());
        service.putExtra(OnyxWidgetService.EXTRA_DAYS, days);
        service.setData(Uri.parse("onyx-widget://" + id + "/" + day + "/" + days)); // distinct per widget and day
        v.setRemoteAdapter(R.id.widget_list, service);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);
        v.setTextViewText(R.id.widget_empty, WidgetData.paired(ctx)
            ? (covers(ctx, day) ? "Nothing on this day" : "Loading…")
            : "Open Onyx on this phone and pair it with your PC");
        // Rows fill this in: open the day in the app, or tick a task off. It goes through an
        // activity, since Android lets a tap on a widget open the app but not a broadcast.
        Intent template = new Intent(ctx, WidgetActionActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        int mutable = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        v.setPendingIntentTemplate(R.id.widget_list,
            PendingIntent.getActivity(ctx, id * 100 + 9, template, PendingIntent.FLAG_UPDATE_CURRENT | mutable));
    }

    private RemoteViews renderMonth(Context ctx, int id, JSONObject data, int h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_month);
        v.setOnClickPendingIntent(R.id.widget_prev, action(ctx, id, "prevMonth", 4));
        v.setOnClickPendingIntent(R.id.widget_next, action(ctx, id, "nextMonth", 5));
        v.setOnClickPendingIntent(R.id.widget_title, action(ctx, id, "today", 6));
        v.setOnClickPendingIntent(R.id.widget_refresh, action(ctx, id, "refresh", 2));
        v.setOnClickPendingIntent(R.id.widget_open, open(ctx, "calendar", null, 3));
        v.setTextViewText(R.id.widget_status, status(ctx));

        LocalDate today = LocalDate.now();
        LocalDate picked = today.plusDays(WidgetData.dayOffset(ctx, id));
        Locale locale = Locale.getDefault();
        String monthName = picked.getMonth().getDisplayName(TextStyle.FULL, locale);
        v.setTextViewText(R.id.widget_title, picked.getYear() == today.getYear() ? monthName : monthName + " " + picked.getYear());

        LocalDate first = WidgetData.gridStart(picked);
        for (int i = 0; i < 7; i++) {
            String name = first.plusDays(i).getDayOfWeek().getDisplayName(TextStyle.NARROW, locale);
            v.setTextViewText(WidgetMonthIds.WEEKDAYS[i], name);
        }
        // Five weeks are enough for most months: the sixth row shows only when needed.
        boolean sixth = first.plusDays(35).getMonth() == picked.getMonth();
        v.setViewVisibility(WidgetMonthIds.WEEKS[5], sixth ? View.VISIBLE : View.GONE);

        List<WidgetItems.Item> all = WidgetItems.agenda(data);
        for (int i = 0; i < 42; i++) {
            LocalDate day = first.plusDays(i);
            boolean inMonth = day.getMonth() == picked.getMonth();
            boolean isToday = day.equals(today), isPicked = day.equals(picked);
            v.setTextViewText(WidgetMonthIds.DAYS[i], String.valueOf(day.getDayOfMonth()));
            v.setTextColor(WidgetMonthIds.DAYS[i], isToday ? 0xFFFFFFFF : inMonth ? 0xFFE6E6EC : 0xFF45454D);
            v.setInt(WidgetMonthIds.DAYS[i], "setBackgroundResource",
                isToday ? R.drawable.widget_day_today : isPicked ? R.drawable.widget_day_picked : 0);
            v.setTextViewText(WidgetMonthIds.DOTS[i], dots(WidgetItems.onDay(all, day), inMonth));
            v.setOnClickPendingIntent(WidgetMonthIds.CELLS[i], pick(ctx, id, day, i));
        }

        String when = picked.equals(today) ? "Today" : dayName(picked);
        v.setTextViewText(R.id.widget_subtitle, when + " · " + picked.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)));
        bindList(ctx, v, id, picked, 1);
        return v;
    }

    /** Up to three dots in the colours of a day's entries (dimmer outside the month). */
    private static CharSequence dots(List<WidgetItems.Item> items, boolean inMonth) {
        SpannableStringBuilder out = new SpannableStringBuilder();
        List<Integer> seen = new ArrayList<>();
        for (WidgetItems.Item it : items) {
            if (seen.size() == 3) break;
            if (seen.contains(it.color)) continue;
            seen.add(it.color);
            int start = out.length();
            out.append(seen.size() > 1 ? " ●" : "●");
            int color = inMonth ? it.color : (it.color & 0x00FFFFFF) | 0x66000000;
            out.setSpan(new ForegroundColorSpan(color), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return out;
    }

    private PendingIntent pick(Context ctx, int id, LocalDate day, int cell) {
        Intent i = new Intent(ctx, getClass()).setAction(ACTION)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra(EXTRA_DO, "pick").putExtra(EXTRA_DATE, day.toString());
        return PendingIntent.getBroadcast(ctx, id * 100 + 20 + cell, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ------------------------------------------------------------ words

    static String dayName(LocalDate day) {
        LocalDate today = LocalDate.now();
        if (day.equals(today)) return "Today";
        if (day.equals(today.plusDays(1))) return "Tomorrow";
        if (day.equals(today.minusDays(1))) return "Yesterday";
        return day.getDayOfWeek().getDisplayName(java.time.format.TextStyle.FULL, Locale.getDefault());
    }

    static String time(LocalDateTime t) {
        return t.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT));
    }

    private static String whenText(WidgetItems.Item it) {
        if (it.allDay) return "All day · " + it.calendar;
        LocalDateTime now = LocalDateTime.now();
        if (!it.start.isAfter(now)) return "Now, until " + time(it.end);
        long minutes = java.time.Duration.between(now, it.start).toMinutes();
        String in = minutes < 60 ? "in " + minutes + " min" : it.start.toLocalDate().equals(now.toLocalDate()) ? "" : dayName(it.start.toLocalDate());
        return time(it.start) + (in.isEmpty() ? "" : " · " + in);
    }

    private static String status(Context ctx) {
        long updated = WidgetData.prefs(ctx).getLong("updated", 0);
        String error = WidgetData.prefs(ctx).getString("error", "");
        if (!WidgetData.paired(ctx)) return "Not paired";
        String when = updated == 0 ? "" : time(LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(updated), java.time.ZoneId.systemDefault()));
        if (!error.isEmpty()) return error + (when.isEmpty() ? "" : " · showing " + when);
        return when.isEmpty() ? "Loading…" : "Updated " + when;
    }

    // ------------------------------------------------------------ taps

    private PendingIntent action(Context ctx, int id, String what, int n) {
        Intent i = new Intent(ctx, getClass()).setAction(ACTION)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra(EXTRA_DO, what);
        return PendingIntent.getBroadcast(ctx, id * 100 + n, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Opens the app on its calendar (at `date`): onyx://open?view=calendar */
    private static PendingIntent open(Context ctx, String view, String date, int n) {
        Intent i = openIntent(ctx, view, date);
        return PendingIntent.getActivity(ctx, 9000 + n, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Intent openIntent(Context ctx, String view, String date) {
        // A fresh number each time, so the app treats every tap as new.
        String url = "onyx://open?view=" + view + (date != null ? "&date=" + date : "") + "&n=" + System.currentTimeMillis();
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    static void openApp(Context ctx, String view, String date) {
        ctx.startActivity(openIntent(ctx, view, date));
    }
}
