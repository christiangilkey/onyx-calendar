package com.onyxcalendar.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The Onyx home-screen widget: your calendar or your globe, at any size.
 *
 *   small (one row)   what is next, or a small globe
 *   medium            a day's agenda (‹ › to step through days), or the globe (↺ ↻ to turn it)
 *   tall              the agenda for the week
 *
 * Tapping an entry opens it in the app; ✓ ticks a task off; the globe opens the app's globe.
 * OnyxGlobeWidget is the same widget, starting on the globe.
 */
public class OnyxWidget extends AppWidgetProvider {
    static final String ACTION = "com.onyxcalendar.app.WIDGET";
    static final String EXTRA_DO = "do";
    static final String EXTRA_TASK = "task";
    static final String EXTRA_DATE = "date";

    /** The view a new widget starts on. */
    protected String defaultMode() {
        return "calendar";
    }

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
            case "toggle":
                WidgetData.setMode(ctx, id, "globe".equals(mode(ctx, id)) ? "calendar" : "globe");
                render(ctx, mgr, id);
                break;
            case "prev":
            case "next":
            case "today": {
                int offset = "today".equals(what) ? 0 : WidgetData.dayOffset(ctx, id) + ("next".equals(what) ? 1 : -1);
                WidgetData.setDayOffset(ctx, id, offset);
                render(ctx, mgr, id);
                if (!covers(ctx, LocalDate.now().plusDays(offset))) refreshInBackground(ctx, LocalDate.now().plusDays(offset));
                break;
            }
            case "left":
            case "right":
                WidgetData.setYaw(ctx, id, WidgetData.yaw(ctx, id) + ("right".equals(what) ? 40f : -40f));
                render(ctx, mgr, id);
                break;
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

    private String mode(Context ctx, int id) {
        return WidgetData.mode(ctx, id, defaultMode());
    }

    /** Whether the kept data covers `day` (it holds a week from its start). */
    private static boolean covers(Context ctx, LocalDate day) {
        String start = WidgetData.cached(ctx).optString("start", "");
        if (start.isEmpty()) return false;
        LocalDate s = LocalDate.parse(start);
        return !day.isBefore(s) && day.isBefore(s.plusDays(WidgetData.DAYS));
    }

    /** Fetches from the PC off the main thread, then redraws every Onyx widget. */
    void refreshInBackground(Context ctx, LocalDate start) {
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            WidgetData.fetch(app, start != null ? start : LocalDate.now());
            renderAll(app);
        }).start();
    }

    /** Redraws every Onyx widget on the home screen (both kinds). */
    static void renderAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        OnyxWidget calendar = new OnyxWidget();
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, OnyxWidget.class))) calendar.render(ctx, mgr, id);
        OnyxWidget globe = new OnyxGlobeWidget();
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, OnyxGlobeWidget.class))) globe.render(ctx, mgr, id);
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
        String mode = mode(ctx, id);
        JSONObject data = WidgetData.cached(ctx);
        RemoteViews views = small ? renderSmall(ctx, id, mode, data, w, h) : renderFull(ctx, mgr, id, mode, data, w, h);
        mgr.updateAppWidget(id, views);
        if (!small && "calendar".equals(mode)) mgr.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
    }

    private RemoteViews renderSmall(Context ctx, int id, String mode, JSONObject data, int w, int h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_small);
        v.setOnClickPendingIntent(R.id.widget_toggle, action(ctx, id, "toggle", 1));
        v.setImageViewResource(R.id.widget_toggle, "globe".equals(mode) ? R.drawable.ic_w_calendar : R.drawable.ic_w_globe);
        if ("globe".equals(mode)) {
            float density = ctx.getResources().getDisplayMetrics().density;
            int size = (int) (Math.min(h, 110) * density);
            v.setViewVisibility(R.id.widget_small_globe, View.VISIBLE);
            v.setImageViewBitmap(R.id.widget_small_globe, globe(ctx, data, size, size, WidgetData.yaw(ctx, id)));
            int count = 0;
            Map<String, List<WidgetItems.Node>> clusters = WidgetItems.clusters(data);
            for (List<WidgetItems.Node> l : clusters.values()) count += l.size();
            v.setTextViewText(R.id.widget_small_title, "Globe");
            v.setTextViewText(R.id.widget_small_meta, count + " items · " + clusters.size() + " clusters");
            v.setInt(R.id.widget_small_bar, "setBackgroundColor", 0xFF8B7CFF);
            v.setOnClickPendingIntent(R.id.widget_small_body, open(ctx, "globe", null, 2));
            return v;
        }
        v.setViewVisibility(R.id.widget_small_globe, View.GONE);
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

    private RemoteViews renderFull(Context ctx, AppWidgetManager mgr, int id, String mode, JSONObject data, int w, int h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_onyx);
        boolean globe = "globe".equals(mode);
        v.setImageViewResource(R.id.widget_toggle, globe ? R.drawable.ic_w_calendar : R.drawable.ic_w_globe);
        v.setOnClickPendingIntent(R.id.widget_toggle, action(ctx, id, "toggle", 1));
        v.setOnClickPendingIntent(R.id.widget_refresh, action(ctx, id, "refresh", 2));
        v.setOnClickPendingIntent(R.id.widget_open, open(ctx, globe ? "globe" : "calendar", null, 3));
        v.setTextViewText(R.id.widget_status, status(ctx));
        v.setViewVisibility(R.id.widget_list, globe ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.widget_globe, globe ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_empty, View.GONE);

        if (globe) {
            v.setImageViewResource(R.id.widget_prev, R.drawable.ic_w_left);
            v.setImageViewResource(R.id.widget_next, R.drawable.ic_w_right);
            v.setOnClickPendingIntent(R.id.widget_prev, action(ctx, id, "left", 4));
            v.setOnClickPendingIntent(R.id.widget_next, action(ctx, id, "right", 5));
            v.setOnClickPendingIntent(R.id.widget_title, open(ctx, "globe", null, 6));
            Map<String, List<WidgetItems.Node>> clusters = WidgetItems.clusters(data);
            v.setTextViewText(R.id.widget_title, "Globe");
            v.setTextViewText(R.id.widget_subtitle, clusters.size() + (clusters.size() == 1 ? " cluster" : " clusters"));
            float density = ctx.getResources().getDisplayMetrics().density;
            // The picture fills the body: the widget minus its header and footer.
            int pw = (int) (w * density), ph = (int) Math.max(60, (h - 74) * density);
            float scale = Math.min(1f, 760f / Math.max(pw, ph)); // keep the picture small enough to send
            v.setImageViewBitmap(R.id.widget_globe, globe(ctx, data, (int) (pw * scale), (int) (ph * scale), WidgetData.yaw(ctx, id)));
            v.setOnClickPendingIntent(R.id.widget_globe, open(ctx, "globe", null, 7));
            return v;
        }

        int offset = WidgetData.dayOffset(ctx, id);
        LocalDate day = LocalDate.now().plusDays(offset);
        int days = h >= 260 ? WidgetData.DAYS : 1; // tall widgets show the week
        v.setImageViewResource(R.id.widget_prev, R.drawable.ic_w_prev);
        v.setImageViewResource(R.id.widget_next, R.drawable.ic_w_next);
        v.setOnClickPendingIntent(R.id.widget_prev, action(ctx, id, "prev", 4));
        v.setOnClickPendingIntent(R.id.widget_next, action(ctx, id, "next", 5));
        v.setOnClickPendingIntent(R.id.widget_title, action(ctx, id, "today", 6));
        v.setTextViewText(R.id.widget_title, dayName(day));
        v.setTextViewText(R.id.widget_subtitle, days > 1 ? "and the week ahead" : day.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)));

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
        return v;
    }

    private static Bitmap globe(Context ctx, JSONObject data, int w, int h, float yaw) {
        float density = ctx.getResources().getDisplayMetrics().density;
        return GlobeRenderer.render(WidgetItems.clusters(data), (tag) -> WidgetItems.tagColor(data, tag), w, h, yaw, density);
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

    /** Opens the app on its calendar (at `date`) or its globe: onyx://open?view=… */
    private static PendingIntent open(Context ctx, String view, String date, int n) {
        Intent i = openIntent(ctx, view, date);
        return PendingIntent.getActivity(ctx, 9000 + n + ("globe".equals(view) ? 50 : 0), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
