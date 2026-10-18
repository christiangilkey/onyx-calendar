package com.onyxcalendar.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * What Onyx Home (the launcher) and the lock screen show: today's and tomorrow's entries
 * and the goals, read from Onyx on the PC like the widgets are; what is on now, what is
 * next, and when the Pi phones. Also where Onyx shows (home screen, lock screen, both or
 * neither), and the switches Android keeps for that.
 */
final class LauncherData {
    static final String PREFS = "onyx_launcher";
    static final String SHOW_HOME = "home", SHOW_LOCK = "lock", SHOW_BOTH = "both", SHOW_OFF = "off";
    static final long MIN = 60_000L;
    /** How long a call stays "calling now" on screen once its time comes (or until the entry starts). */
    static final long CALL_SHOWS = 30 * MIN;
    /** How far ahead a coming call is mentioned. */
    static final long CALL_AHEAD = 60 * MIN;

    private LauncherData() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------ where Onyx shows

    static String show(Context ctx) {
        return prefs(ctx).getString("show", SHOW_HOME);
    }

    static boolean onHome(Context ctx) {
        String s = show(ctx);
        return SHOW_HOME.equals(s) || SHOW_BOTH.equals(s);
    }

    static boolean onLock(Context ctx) {
        String s = show(ctx);
        return SHOW_LOCK.equals(s) || SHOW_BOTH.equals(s);
    }

    static void setShow(Context ctx, String show) {
        if (!SHOW_HOME.equals(show) && !SHOW_LOCK.equals(show) && !SHOW_BOTH.equals(show) && !SHOW_OFF.equals(show)) show = SHOW_HOME;
        prefs(ctx).edit().putString("show", show).apply();
        OnyxLiveService.sync(ctx);
    }

    /** The alarm as each thing starts: on unless turned off (whatever the home and lock screen show). */
    static boolean alarmOn(Context ctx) {
        return prefs(ctx).getBoolean("alarm", false);
    }

    static void setAlarm(Context ctx, boolean on) {
        prefs(ctx).edit().putBoolean("alarm", on).apply();
        AlarmActivity.cancel(ctx);
        AlarmActivity.planNext(ctx);
        OnyxLiveService.poke(ctx);
    }

    static String showLabel(String show) {
        switch (show) {
            case SHOW_LOCK: return "Lock screen";
            case SHOW_BOTH: return "Home and lock screen";
            case SHOW_OFF: return "Neither";
            default: return "Home screen";
        }
    }

    // ------------------------------------------------------------ Android's switches

    /** Whether Onyx Home is the phone's home app. */
    static boolean isHomeApp(Context ctx) {
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = ctx.getSystemService(RoleManager.class);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) return rm.isRoleHeld(RoleManager.ROLE_HOME);
        }
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo r = ctx.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        return r != null && r.activityInfo != null && ctx.getPackageName().equals(r.activityInfo.packageName);
    }

    static boolean notificationsAllowed(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        return nm != null && nm.areNotificationsEnabled();
    }

    /** "Display over other apps": lets the Onyx panel come up over the lock screen as the screen turns on. */
    static boolean overlayAllowed(Context ctx) {
        return Settings.canDrawOverlays(ctx);
    }

    /** Full-screen alerts (Android 14 asks for them separately): a call alert fills the locked screen. */
    static boolean fullScreenAllowed(Context ctx) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        return nm != null && nm.canUseFullScreenIntent();
    }

    static JSONObject info(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            o.put("show", show(ctx));
            o.put("isHome", isHomeApp(ctx));
            o.put("notifications", notificationsAllowed(ctx));
            o.put("overlay", overlayAllowed(ctx));
            o.put("fullScreen", fullScreenAllowed(ctx));
            o.put("alarm", prefs(ctx).getBoolean("alarm", false));
        } catch (Exception ignored) {
            // a JSON key can't fail here
        }
        return o;
    }

    /** Opens the place in Android's settings where one of the switches above is turned on. */
    static void open(Activity activity, String what) {
        String pkg = activity.getPackageName();
        Intent intent;
        switch (what == null ? "" : what) {
            case "home":
                if (Build.VERSION.SDK_INT >= 29) {
                    RoleManager rm = activity.getSystemService(RoleManager.class);
                    if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                        try {
                            activity.startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), 4101);
                            return;
                        } catch (Exception ignored) {
                            // fall through to the settings page
                        }
                    }
                }
                intent = new Intent(Settings.ACTION_HOME_SETTINGS);
                break;
            case "notifications":
                if (Build.VERSION.SDK_INT >= 33
                    && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    && !prefs(activity).getBoolean("asked_notifications", false)) {
                    prefs(activity).edit().putBoolean("asked_notifications", true).apply();
                    activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4102);
                    return;
                }
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "overlay":
                intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + pkg));
                break;
            case "fullscreen":
                intent = Build.VERSION.SDK_INT >= 34
                    ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg))
                    : new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "appinfo":
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                break;
            case "launcher":
                intent = new Intent(activity, LauncherActivity.class);
                break;
            default:
                intent = new Intent(Settings.ACTION_SETTINGS);
        }
        try {
            activity.startActivity(intent);
        } catch (Exception e) {
            try {
                activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
            } catch (Exception ignored) {
                // nothing more to try
            }
        }
    }

    // ------------------------------------------------------------ the data, from the PC

    /** Fetches today's and tomorrow's entries and the goals, and keeps them for when the PC can't be reached. */
    static void fetch(Context ctx) {
        try {
            ZoneId zone = ZoneId.systemDefault();
            LocalDate today = LocalDate.now(zone);
            String from = today.atStartOfDay(zone).toInstant().toString();
            String to = today.plusDays(2).atStartOfDay(zone).toInstant().toString();
            Object ev = WidgetData.rpc(ctx, "events", new JSONArray().put(from).put(to));
            JSONArray events = ev instanceof JSONObject ? ((JSONObject) ev).optJSONArray("events") : null;
            JSONArray goals = null;
            try {
                Object g = WidgetData.rpc(ctx, "goals", new JSONArray());
                if (g instanceof JSONArray) goals = (JSONArray) g;
            } catch (Exception ignored) {
                // an older PC without goals: the rest still shows
            }
            JSONObject data = new JSONObject();
            data.put("day", today.toString());
            data.put("events", events != null ? events : new JSONArray());
            data.put("goals", goals != null ? goals : new JSONArray());
            prefs(ctx).edit()
                .putString("data", data.toString())
                .putLong("updated", System.currentTimeMillis())
                .putString("error", "")
                .apply();
        } catch (Exception e) {
            prefs(ctx).edit().putString("error", e.getMessage() == null ? "Can't reach the PC" : e.getMessage()).apply();
        }
    }

    static long updated(Context ctx) {
        return prefs(ctx).getLong("updated", 0);
    }

    static String error(Context ctx) {
        if (!WidgetData.paired(ctx)) return "Open Onyx and pair it with your PC.";
        return prefs(ctx).getString("error", "");
    }

    static JSONObject cached(Context ctx) {
        try {
            return new JSONObject(prefs(ctx).getString("data", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** "Leaving now": the Pi makes no more calls about this entry; a task is ticked off instead. */
    static void acknowledge(Context ctx, Item item) throws Exception {
        if ("task".equals(item.kind)) WidgetData.completeTask(ctx, item.id);
        else WidgetData.rpc(ctx, "event:ack", new JSONArray().put(item.id));
        // Seen at once, before the next fetch.
        prefs(ctx).edit().putBoolean("ack_" + item.id + "_" + item.start, true).apply();
    }

    // ------------------------------------------------------------ the model

    static final class Alert {
        final long at;
        final String kind; // "call" or "push"

        Alert(long at, String kind) {
            this.at = at;
            this.kind = kind;
        }
    }

    static final class Item {
        String id = "", title = "", kind = "event", color = "";
        long start, end;
        boolean allDay, done, ack;
        int leaveBy = -1; // minutes before the start; -1 for none
        int pomoWork, pomoRest; // a pomodoro split, in minutes (0: none)

        /** Where `t` falls in the pomodoro split: { work (1) or break (0), ms left of the chunk, chunk length ms, round, rounds }, or null. */
        long[] phase(long t) {
            if (pomoWork <= 0 || t < start || t >= end) return null;
            long total = end - start, work = pomoWork * MIN, rest = Math.max(0, pomoRest) * MIN;
            long at = 0, round = 0, rounds = 0;
            for (long x = 0; x < total; ) { rounds++; x += work; if (x >= total) break; x += rest; }
            long into = t - start;
            while (at < total) {
                long w = Math.min(work, total - at);
                round++;
                if (into < at + w) return new long[] { 1, at + w - into, w, round, rounds };
                at += w;
                if (at >= total || rest <= 0) continue;
                long r = Math.min(rest, total - at);
                if (into < at + r) return new long[] { 0, at + r - into, r, round, rounds };
                at += r;
            }
            return null;
        }
        final List<Alert> alerts = new ArrayList<>();

        long leaveAt() {
            return leaveBy > 0 ? start - leaveBy * MIN : -1;
        }

        int colorInt(int fallback) {
            try {
                return color == null || color.isEmpty() ? fallback : Color.parseColor(color);
            } catch (Exception e) {
                return fallback;
            }
        }

        /** The alert ringing now (from its time until the entry starts, for at most CALL_SHOWS). */
        Alert calling(long now) {
            if (done || ack) return null;
            for (Alert a : alerts) {
                if (a.at <= now && now < start && now - a.at < CALL_SHOWS) return a;
            }
            return null;
        }

        /** The next alert still to come, if it is within CALL_AHEAD. */
        Alert coming(long now) {
            if (done || ack) return null;
            for (Alert a : alerts) {
                if (a.at > now && a.at - now <= CALL_AHEAD) return a;
            }
            return null;
        }
    }

    static final class Goal {
        String title = "", color = "";
        int percent, done, total;

        int colorInt(int fallback) {
            try {
                return color == null || color.isEmpty() ? fallback : Color.parseColor(color);
            } catch (Exception e) {
                return fallback;
            }
        }
    }

    /** An ISO time ("2026-10-17T10:00:00.000Z", with an offset, or local) or a day ("2026-10-17"), in ms; -1 if neither. */
    static long time(String s) {
        if (s == null || s.isEmpty()) return -1;
        ZoneId zone = ZoneId.systemDefault();
        try { return OffsetDateTime.parse(s).toInstant().toEpochMilli(); } catch (Exception ignored) { /* next form */ }
        try { return Instant.parse(s).toEpochMilli(); } catch (Exception ignored) { /* next form */ }
        try { return LocalDateTime.parse(s).atZone(zone).toInstant().toEpochMilli(); } catch (Exception ignored) { /* next form */ }
        try { return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s).atStartOfDay(zone).toInstant().toEpochMilli(); } catch (Exception ignored) { /* none */ }
        return -1;
    }

    /** Every entry kept, in time order (all-day ones first on their day). Goals' own bars are left out. */
    static List<Item> items(Context ctx) {
        List<Item> out = new ArrayList<>();
        JSONArray events = cached(ctx).optJSONArray("events");
        if (events == null) return out;
        SharedPreferences p = prefs(ctx);
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null || "goal".equals(e.optString("kind"))) continue;
            Item it = new Item();
            it.id = e.optString("id");
            it.title = e.optString("title", "").trim();
            if (it.title.isEmpty()) it.title = "(no title)";
            it.kind = e.optString("kind", "event");
            it.color = e.optString("color", "");
            it.allDay = e.optBoolean("allDay", false);
            it.start = time(e.optString("start"));
            it.end = time(e.optString("end"));
            if (it.start < 0) continue;
            if (it.end < it.start) it.end = it.start + 30 * MIN;
            it.done = e.optBoolean("done", false);
            it.ack = e.optBoolean("callAck", false) || p.getBoolean("ack_" + it.id + "_" + it.start, false);
            it.leaveBy = e.isNull("leaveBy") ? -1 : e.optInt("leaveBy", -1);
            JSONObject pomo = e.optJSONObject("pomodoro");
            if (pomo != null) { it.pomoWork = pomo.optInt("work", 0); it.pomoRest = pomo.optInt("rest", 0); }
            JSONArray alerts = e.optJSONArray("piAlerts");
            if (alerts != null) {
                for (int j = 0; j < alerts.length(); j++) {
                    JSONObject a = alerts.optJSONObject(j);
                    long at = a == null ? -1 : time(a.optString("at"));
                    if (at > 0) it.alerts.add(new Alert(at, a.optString("kind", "call")));
                }
            }
            long callAt = time(e.optString("callAt", ""));
            if (callAt > 0 && it.alerts.isEmpty()) it.alerts.add(new Alert(callAt, "call"));
            out.add(it);
        }
        // By day, all-day ones first on it, then by time.
        Collections.sort(out, (a, b) -> {
            int day = dayOf(a.start).compareTo(dayOf(b.start));
            if (day != 0) return day;
            if (a.allDay != b.allDay) return a.allDay ? -1 : 1;
            return Long.compare(a.start, b.start);
        });
        return out;
    }

    static List<Goal> goals(Context ctx) {
        List<Goal> out = new ArrayList<>();
        JSONArray goals = cached(ctx).optJSONArray("goals");
        if (goals == null) return out;
        for (int i = 0; i < goals.length(); i++) {
            JSONObject g = goals.optJSONObject(i);
            if (g == null) continue;
            JSONObject progress = g.optJSONObject("progress");
            Goal goal = new Goal();
            goal.title = g.optString("title", "");
            goal.color = g.optString("color", "");
            goal.percent = progress == null ? 0 : Math.max(0, Math.min(100, progress.optInt("percent", 0)));
            goal.done = progress == null ? 0 : progress.optInt("done", 0);
            goal.total = progress == null ? 0 : progress.optInt("total", 0);
            // A finished goal has done its job on this screen.
            if (!goal.title.isEmpty() && (goal.total == 0 || goal.percent < 100)) out.add(goal);
        }
        return out;
    }

    static LocalDate dayOf(long ms) {
        return Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate();
    }

    /** Timed entries count for Now and Next; all-day ones and ticked-off ones don't. */
    static boolean timed(Item it) {
        return !it.allDay && !it.done;
    }

    /** What is on now: the timed entry that started last and hasn't ended. */
    static Item now(List<Item> items, long t) {
        Item best = null;
        for (Item it : items) {
            if (timed(it) && it.start <= t && t < it.end && (best == null || it.start >= best.start)) best = it;
        }
        return best;
    }

    /** What is next: the first timed entry still to start. */
    static Item next(List<Item> items, long t) {
        for (Item it : items) {
            if (timed(it) && it.start > t) return it;
        }
        return null;
    }

    /** The entry the Pi is phoning about right now, if any. */
    static Item calling(List<Item> items, long t) {
        for (Item it : items) {
            if (it.calling(t) != null) return it;
        }
        return null;
    }

    /** The next call coming within the hour. */
    static Item callComing(List<Item> items, long t) {
        Item best = null;
        for (Item it : items) {
            Alert a = it.coming(t);
            if (a != null && (best == null || a.at < best.coming(t).at)) best = it;
        }
        return best;
    }
}
