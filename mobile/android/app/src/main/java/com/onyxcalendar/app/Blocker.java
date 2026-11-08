package com.onyxcalendar.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The blocker on the phone. Block lists (Settings → Blocker, the same lists the PC and the web app have)
 * hold phone apps and websites, and say when they are on: a schedule, switched on by hand (for a while, or
 * until switched off), or during Hyperfocus. While one is on, the doomscroll saver's service
 * (DoomscrollService, allowed in Android's Accessibility settings) covers a blocked app as it comes to the
 * front, and a blocked site in a browser, with the way back to Onyx and the way out.
 *
 * The lists are kept here too, so the phone blocks with the PC off: the app hands over every change made on
 * the phone at once, and LauncherData.fetch brings the PC's copy when it is newer. The rules are the ones in
 * src/renderer/block-rules.js, line for line (test/blocker.test.js holds them to it).
 */
final class Blocker {
    static final String PREFS = "onyx_blocker";
    /** Never covered, whatever a list says: Onyx itself, the phone's own bars and its Settings. */
    static final Set<String> NEVER = new HashSet<>(Arrays.asList("com.onyxcalendar.app", "com.android.systemui", "com.android.settings"));

    private static JSONArray cache;

    private Blocker() {
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized JSONArray lists(Context ctx) {
        if (cache == null) {
            try {
                cache = new JSONArray(prefs(ctx).getString("lists", "[]"));
            } catch (Exception e) {
                cache = new JSONArray();
            }
        }
        return cache;
    }

    /** When the copy kept here last changed (ms). */
    static long at(Context ctx) {
        return prefs(ctx).getLong("at", 0);
    }

    /** A copy of the lists: kept when it is as new as this one or newer, or made on this phone (`mine`). */
    static synchronized boolean put(Context ctx, JSONArray lists, long at, boolean mine) {
        if (lists == null || (!mine && at < at(ctx))) return false;
        prefs(ctx).edit().putString("lists", lists.toString()).putLong("at", at).apply();
        cache = lists;
        DoomscrollService s = DoomscrollService.live;
        if (s != null) s.recheck();
        return true;
    }

    // ---- when a list is on (block-rules.js: runOn, windowAt, stateOf)

    private static int minutesOf(String t) {
        if (t == null || !t.matches("([01]\\d|2[0-3]):[0-5]\\d")) return -1;
        return Integer.parseInt(t.substring(0, 2)) * 60 + Integer.parseInt(t.substring(3, 5));
    }

    private static long at(LocalDate day, int min, ZoneId zone) {
        return day.atTime(min / 60, min % 60).atZone(zone).toInstant().toEpochMilli();
    }

    private static boolean has(JSONArray a, int v) {
        if (a == null) return false;
        for (int i = 0; i < a.length(); i++) if (a.optInt(i, -1) == v) return true;
        return false;
    }

    /** Every run of a schedule from yesterday (one may still be going past midnight) to a week ahead: [start, end]. */
    static List<long[]> runs(JSONArray schedule, long now) {
        List<long[]> out = new ArrayList<>();
        if (schedule == null) return out;
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        for (int i = -1; i <= 7; i++) {
            LocalDate day = today.plusDays(i);
            int dow = day.getDayOfWeek().getValue() % 7; // Sunday 0, as JavaScript counts
            for (int k = 0; k < schedule.length(); k++) {
                JSONObject w = schedule.optJSONObject(k);
                if (w == null || !has(w.optJSONArray("days"), dow)) continue;
                int s = minutesOf(w.optString("start")), e = minutesOf(w.optString("end"));
                if (s < 0 || e < 0) continue;
                // An end at or before the start runs past midnight into the next day (the same time: the whole day).
                long end = e > s ? at(day, e, zone) : at(day.plusDays(1), e, zone);
                out.add(new long[] { at(day, s, zone), end });
            }
        }
        out.sort((a, b) -> Long.compare(a[0], b[0]));
        return out;
    }

    /** The scheduled time going on at `now`, { start, end }, with any times that touch it carried on; null when none. */
    static long[] windowAt(JSONArray schedule, long now) {
        List<long[]> all = runs(schedule, now);
        long[] hit = null;
        for (long[] r : all) if (r[0] <= now && now < r[1]) { hit = r; break; }
        if (hit == null) return null;
        long end = hit[1];
        for (int guard = 0; guard < 64; guard++) { // 9–12 then 12–5: on until 5
            long[] more = null;
            for (long[] r : all) if (r[0] <= end && r[1] > end) { more = r; break; }
            if (more == null) break;
            end = more[1];
        }
        return new long[] { hit[0], end };
    }

    /** Whether a list is on at `now`: until when (ms), 0 when only switching it off ends it, -1 when it is off. */
    static long until(JSONObject l, long now, long focusUntil) {
        JSONObject m = l.optJSONObject("manual");
        long mu = m == null ? 0 : m.optLong("until", 0);
        boolean manual = m != null && m.optBoolean("on", false) && (mu == 0 || mu > now);
        boolean skipped = l.optLong("skipUntil", 0) > now;
        long[] win = skipped ? null : windowAt(l.optJSONArray("schedule"), now);
        boolean focus = !skipped && l.optBoolean("duringFocus", false) && focusUntil > now;
        if (!manual && win == null && !focus) return -1;
        if (manual && mu == 0) return 0;
        return Math.max(manual ? mu : 0, Math.max(win != null ? win[1] : 0, focus ? focusUntil : 0));
    }

    /** A Hyperfocus session's end (this phone's own, or the PC's), or 0. */
    static long focusUntil(Context ctx, long now) {
        LauncherData.Focus f = LauncherData.focus(ctx);
        return f != null && f.end > now ? f.end : 0;
    }

    // ---- which site an address is on (block-rules.js: hostOf, siteHit)

    /** The host an address is on ("m.youtube.com/shorts" → "m.youtube.com"), or null for words being typed. */
    static String hostOf(String url) {
        if (url == null) return null;
        String x = url.trim().toLowerCase(Locale.ROOT).replaceFirst("^[a-z][a-z0-9+.-]*://", "");
        x = x.split("[/?#\\s]", 2)[0].replaceFirst("^[^@]*@", "").replaceFirst(":\\d*$", "").replaceFirst("\\.+$", "");
        return x.matches("[a-z0-9-]+(\\.[a-z0-9-]+)+") ? x : null;
    }

    /** The blocked site a host is on: the site itself or any part of it ("m.youtube.com" is on "youtube.com"), or null. */
    static String siteHit(String host, JSONArray sites) {
        String h = hostOf(host);
        if (h == null || sites == null) return null;
        for (int i = 0; i < sites.length(); i++) {
            String s = sites.optString(i, "");
            if (!s.isEmpty() && (h.equals(s) || h.endsWith("." + s))) return s;
        }
        return null;
    }

    // ---- what is blocked now

    /** A blocked app or site: the list it is on, its name, the site (null for an app) and until when (0: until switched off). */
    static final class Hit {
        String list, label, site;
        long until;
    }

    /** Whether any list is on now with something on this phone to block (so the service looks at what is in front). */
    static boolean any(Context ctx, long now) {
        JSONArray all = lists(ctx);
        if (all.length() == 0) return false;
        long focus = focusUntil(ctx, now);
        for (int i = 0; i < all.length(); i++) {
            JSONObject l = all.optJSONObject(i);
            if (l == null) continue;
            JSONArray apps = l.optJSONArray("phoneApps"), sites = l.optJSONArray("sites");
            if ((apps == null || apps.length() == 0) && (sites == null || sites.length() == 0)) continue;
            if (until(l, now, focus) >= 0) return true;
        }
        return false;
    }

    /** What blocks the app in front (or, in a browser, the site it shows, `host`) now: the first list on that has it, or null. */
    static Hit hit(Context ctx, String pkg, String host, long now) {
        if (pkg == null || pkg.isEmpty() || NEVER.contains(pkg) || pkg.equals(ctx.getPackageName())) return null;
        JSONArray all = lists(ctx);
        long focus = focusUntil(ctx, now);
        for (int i = 0; i < all.length(); i++) {
            JSONObject l = all.optJSONObject(i);
            if (l == null) continue;
            long u = until(l, now, focus);
            if (u < 0) continue;
            String name = l.optString("name", "Block list");
            JSONArray apps = l.optJSONArray("phoneApps");
            if (apps != null) {
                for (int k = 0; k < apps.length(); k++) {
                    JSONObject a = apps.optJSONObject(k);
                    if (a != null && pkg.equals(a.optString("pkg"))) {
                        Hit h = new Hit();
                        h.list = name;
                        h.label = a.optString("label", pkg);
                        h.until = u;
                        return h;
                    }
                }
            }
            String site = host == null ? null : siteHit(host, l.optJSONArray("sites"));
            if (site != null) {
                Hit h = new Hit();
                h.list = name;
                h.label = site;
                h.site = site;
                h.until = u;
                return h;
            }
        }
        return null;
    }

    /** For Settings → Blocker: the lists kept here, when they changed, and whether this phone can block. */
    static JSONObject info(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            o.put("lists", lists(ctx));
            o.put("at", at(ctx));
            o.put("allowed", DoomscrollService.allowed(ctx));
            o.put("running", DoomscrollService.live != null);
        } catch (Exception ignored) {
            // a JSON key can't fail here
        }
        return o;
    }
}
