package com.onyxcalendar.app;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** The rows of a widget's agenda: a day (or a week, with a heading for each day). */
public class OnyxWidgetService extends RemoteViewsService {
    static final String EXTRA_DAY = "day";
    static final String EXTRA_DAYS = "days";

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext(), intent);
    }

    private static final class Row {
        String heading;          // a day's heading, or null for an entry
        WidgetItems.Item item;
    }

    private static final class Rows implements RemoteViewsFactory {
        private final Context ctx;
        private final LocalDate first;
        private final int days;
        private final List<Row> rows = new ArrayList<>();

        Rows(Context ctx, Intent intent) {
            this.ctx = ctx;
            String day = intent.getStringExtra(EXTRA_DAY);
            this.first = day != null ? LocalDate.parse(day) : LocalDate.now();
            this.days = Math.max(1, intent.getIntExtra(EXTRA_DAYS, 1));
        }

        @Override public void onCreate() {}
        @Override public void onDestroy() { rows.clear(); }

        @Override
        public void onDataSetChanged() {
            rows.clear();
            List<WidgetItems.Item> all = WidgetItems.agenda(WidgetData.cached(ctx));
            for (int d = 0; d < days; d++) {
                LocalDate day = first.plusDays(d);
                List<WidgetItems.Item> items = WidgetItems.onDay(all, day);
                if (days > 1) {
                    if (items.isEmpty()) continue;
                    Row h = new Row();
                    h.heading = OnyxWidget.dayName(day) + " · " + day.getMonth().getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault()) + " " + day.getDayOfMonth();
                    rows.add(h);
                }
                for (WidgetItems.Item it : items) {
                    Row r = new Row();
                    r.item = it;
                    rows.add(r);
                }
            }
        }

        @Override public int getCount() { return rows.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
            if (position >= rows.size()) return v;
            Row r = rows.get(position);
            if (r.heading != null) {
                v.setViewVisibility(R.id.row_heading, View.VISIBLE);
                v.setViewVisibility(R.id.row_entry, View.GONE);
                v.setTextViewText(R.id.row_heading, r.heading);
                return v;
            }
            WidgetItems.Item it = r.item;
            v.setViewVisibility(R.id.row_heading, View.GONE);
            v.setViewVisibility(R.id.row_entry, View.VISIBLE);
            v.setInt(R.id.row_bar, "setBackgroundColor", it.color);
            v.setTextViewText(R.id.row_time, it.allDay ? "All day" : OnyxWidget.time(it.start));
            v.setTextViewText(R.id.row_title, it.title);
            String meta = it.allDay || it.isTask() ? it.calendar : "until " + OnyxWidget.time(it.end) + " · " + it.calendar;
            if (it.piCall) meta += " · Pi call";
            v.setTextViewText(R.id.row_meta, meta);
            // Tapping the row opens that day in the app; a task's ✓ ticks it off.
            v.setOnClickFillInIntent(R.id.row_entry, new Intent()
                .putExtra(OnyxWidget.EXTRA_DO, "open").putExtra(OnyxWidget.EXTRA_DATE, it.day.toString()));
            if (it.isTask()) {
                v.setViewVisibility(R.id.row_done, View.VISIBLE);
                v.setOnClickFillInIntent(R.id.row_done, new Intent()
                    .putExtra(OnyxWidget.EXTRA_DO, "done").putExtra(OnyxWidget.EXTRA_TASK, it.id));
            } else {
                v.setViewVisibility(R.id.row_done, View.GONE);
            }
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
