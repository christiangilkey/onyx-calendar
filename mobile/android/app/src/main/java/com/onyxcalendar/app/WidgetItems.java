package com.onyxcalendar.app;

import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** The agenda the PC sent (GET /api/agenda), read into entries for the widgets. */
final class WidgetItems {
    private WidgetItems() {}

    static final class Item {
        String id = "", kind = "event", title = "", calendar = "";
        boolean allDay, piCall;
        LocalDate day, lastDay;     // all-day: the days it covers (lastDay inclusive)
        LocalDateTime start, end;   // timed: local times
        int color = 0xFF8B7CFF;
        List<String> tags = new ArrayList<>();

        boolean isTask() { return "task".equals(kind); }
    }

    static int parseColor(String hex, int fallback) {
        try { return hex == null || hex.isEmpty() ? fallback : Color.parseColor(hex); } catch (Exception e) { return fallback; }
    }

    private static List<String> tags(JSONObject o) {
        List<String> out = new ArrayList<>();
        JSONArray a = o.optJSONArray("tags");
        if (a != null) for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        return out;
    }

    /** Agenda entries: events, time blocks, dated tasks and goal bars. */
    static List<Item> agenda(JSONObject data) {
        List<Item> out = new ArrayList<>();
        JSONArray events = data.optJSONArray("events");
        if (events == null) return out;
        ZoneId zone = ZoneId.systemDefault();
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null) continue;
            Item it = new Item();
            it.id = e.optString("id");
            it.kind = e.optString("kind", "event");
            it.title = e.optString("title", "(No title)");
            it.calendar = e.optString("calendar");
            it.allDay = e.optBoolean("all_day");
            it.piCall = e.optBoolean("pi_call");
            it.color = parseColor(e.optString("color"), it.color);
            it.tags = tags(e);
            try {
                String s = e.optString("start"), en = e.optString("end");
                if (it.allDay || s.length() == 10) {
                    it.allDay = true;
                    it.day = LocalDate.parse(s.substring(0, 10));
                    LocalDate endDay = en.length() >= 10 ? LocalDate.parse(en.substring(0, 10)) : it.day.plusDays(1);
                    it.lastDay = endDay.isAfter(it.day) ? endDay.minusDays(1) : it.day;
                } else {
                    it.start = OffsetDateTime.parse(s).atZoneSameInstant(zone).toLocalDateTime();
                    it.end = OffsetDateTime.parse(en).atZoneSameInstant(zone).toLocalDateTime();
                    it.day = it.start.toLocalDate();
                    it.lastDay = it.end.minusSeconds(1).toLocalDate();
                    if (it.lastDay.isBefore(it.day)) it.lastDay = it.day;
                }
            } catch (Exception ignored) {
                continue;
            }
            out.add(it);
        }
        return out;
    }

    /** What is on one day: all-day entries first, then by time. Goal bars are left out. */
    static List<Item> onDay(List<Item> all, LocalDate day) {
        List<Item> out = new ArrayList<>();
        for (Item it : all) {
            if ("goal".equals(it.kind)) continue;
            if (!day.isBefore(it.day) && !day.isAfter(it.lastDay)) out.add(it);
        }
        Collections.sort(out, (a, b) -> {
            if (a.allDay != b.allDay) return a.allDay ? -1 : 1;
            if (a.allDay) return a.title.compareToIgnoreCase(b.title);
            return a.start.compareTo(b.start);
        });
        return out;
    }

    /** The next thing still to come (or going on now), for the smallest widget. */
    static Item next(List<Item> all) {
        LocalDateTime now = LocalDateTime.now();
        Item best = null;
        for (Item it : all) {
            if (it.allDay || "goal".equals(it.kind) || it.end == null || !it.end.isAfter(now)) continue;
            if (best == null || it.start.isBefore(best.start)) best = it;
        }
        if (best == null) {
            LocalDate today = LocalDate.now();
            for (Item it : all) {
                if (it.allDay && !"goal".equals(it.kind) && !today.isBefore(it.day) && !today.isAfter(it.lastDay)) return it;
            }
        }
        return best;
    }
}
