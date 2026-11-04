package com.onyxcalendar.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * How Onyx is laid out on each screen, set in the app (Settings, Home and lock screen), one layout per
 * screen: the lock screen (the Onyx panel over it, LockPanelActivity) and the home screen (Onyx Home,
 * LauncherActivity). Each has the order of its parts and which show, the clock's size and where it sits,
 * the date, and how dark the screen behind is. The Pi's call always stays at the top, and Hyperfocus
 * always shows (in the clock's place).
 */
final class LockLayout {
    static final String LOCK = "lock", HOME = "home";
    /** The lock screen's parts. */
    static final List<String> PARTS = Arrays.asList("clock", "onyx", "shortcuts", "music", "notifications");
    /** The home screen's: the apps are the ones kept on it, the widgets the ones added to it. */
    static final List<String> HOME_PARTS = Arrays.asList("clock", "onyx", "shortcuts", "widgets", "apps");

    private LockLayout() {}

    static String screen(String s) {
        return HOME.equals(s) ? HOME : LOCK;
    }

    static List<String> parts(String screen) {
        return HOME.equals(screen) ? HOME_PARTS : PARTS;
    }

    private static String key(String screen) {
        return HOME.equals(screen) ? "homeLayout" : "lockLayout";
    }

    /** The lock screen's layout. */
    static JSONObject get(Context ctx) {
        return get(ctx, LOCK);
    }

    /** That screen's layout with every setting filled in: { order, hidden, clockSize, align, date, dim }. */
    static JSONObject get(Context ctx, String screen) {
        screen = screen(screen);
        JSONObject saved;
        try {
            saved = new JSONObject(LauncherData.prefs(ctx).getString(key(screen), "{}"));
        } catch (Exception e) {
            saved = new JSONObject();
        }
        return clean(saved, screen);
    }

    static JSONObject save(Context ctx, JSONObject in) {
        return save(ctx, LOCK, in);
    }

    static JSONObject save(Context ctx, String screen, JSONObject in) {
        screen = screen(screen);
        JSONObject out = clean(in == null ? new JSONObject() : in, screen);
        LauncherData.prefs(ctx).edit().putString(key(screen), out.toString()).apply();
        return out;
    }

    /**
     * Filled in, with each screen's own starting look: the lock screen as it has always been (a large clock in
     * the middle, the screen behind 80% dark), the home screen as Onyx Home has always been (the clock on the
     * left, the wallpaper in full).
     */
    private static JSONObject clean(JSONObject in, String screen) {
        boolean home = HOME.equals(screen);
        List<String> all = parts(screen);
        List<String> order = new ArrayList<>();
        JSONArray o = in.optJSONArray("order");
        for (int i = 0; o != null && i < o.length(); i++) {
            String p = o.optString(i);
            if (all.contains(p) && !order.contains(p)) order.add(p);
        }
        for (String p : all) if (!order.contains(p)) order.add(p); // a part added in a later version goes last
        JSONArray hidden = new JSONArray();
        JSONArray h = in.optJSONArray("hidden");
        for (int i = 0; h != null && i < h.length(); i++) if (all.contains(h.optString(i))) hidden.put(h.optString(i));
        String size = in.optString("clockSize", home ? "medium" : "large");
        if (!Arrays.asList("small", "medium", "large", "huge").contains(size)) size = home ? "medium" : "large";
        String align = in.optString("align", home ? "left" : "center");
        if (!"left".equals(align)) align = "center";
        int dim = Math.max(0, Math.min(100, in.optInt("dim", home ? 0 : 80)));
        JSONObject out = new JSONObject();
        try {
            out.put("order", new JSONArray(order));
            out.put("hidden", hidden);
            out.put("clockSize", size);
            out.put("align", align);
            out.put("date", in.optBoolean("date", true));
            out.put("dim", dim);
        } catch (Exception ignored) {
            // plain values: can't fail
        }
        return out;
    }

    static boolean shows(JSONObject l, String part) {
        JSONArray h = l.optJSONArray("hidden");
        for (int i = 0; h != null && i < h.length(); i++) if (part.equals(h.optString(i))) return false;
        return true;
    }

    static float clockSp(JSONObject l) {
        switch (l.optString("clockSize")) {
            case "small": return 44;
            case "medium": return 60;
            case "huge": return 104;
            default: return 76;
        }
    }

    /** The screen behind: black, `dim` percent opaque. */
    static int backdrop(JSONObject l) {
        int a = Math.round(l.optInt("dim", 80) * 2.55f);
        return (a << 24);
    }
}
