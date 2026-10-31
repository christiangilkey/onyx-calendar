package com.onyxcalendar.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * How the Onyx panel over the lock screen is laid out, set in the app's lock screen editor: the order of
 * its parts and which show, the clock's size and where it sits, the date, and how dark the screen behind is.
 * The Pi's call always stays at the top, and Hyperfocus always shows (in the clock's place).
 */
final class LockLayout {
    static final List<String> PARTS = Arrays.asList("clock", "onyx", "shortcuts", "music", "notifications");
    private static final String KEY = "lockLayout";

    private LockLayout() {}

    /** The layout with every setting filled in: { order, hidden, clockSize, align, date, dim }. */
    static JSONObject get(Context ctx) {
        JSONObject saved;
        try {
            saved = new JSONObject(LauncherData.prefs(ctx).getString(KEY, "{}"));
        } catch (Exception e) {
            saved = new JSONObject();
        }
        return clean(saved);
    }

    static JSONObject save(Context ctx, JSONObject in) {
        JSONObject out = clean(in == null ? new JSONObject() : in);
        LauncherData.prefs(ctx).edit().putString(KEY, out.toString()).apply();
        return out;
    }

    private static JSONObject clean(JSONObject in) {
        List<String> order = new ArrayList<>();
        JSONArray o = in.optJSONArray("order");
        for (int i = 0; o != null && i < o.length(); i++) {
            String p = o.optString(i);
            if (PARTS.contains(p) && !order.contains(p)) order.add(p);
        }
        for (String p : PARTS) if (!order.contains(p)) order.add(p); // a part added in a later version goes last
        JSONArray hidden = new JSONArray();
        JSONArray h = in.optJSONArray("hidden");
        for (int i = 0; h != null && i < h.length(); i++) if (PARTS.contains(h.optString(i))) hidden.put(h.optString(i));
        String size = in.optString("clockSize", "large");
        if (!Arrays.asList("small", "medium", "large", "huge").contains(size)) size = "large";
        String align = "left".equals(in.optString("align")) ? "left" : "center";
        int dim = Math.max(0, Math.min(100, in.optInt("dim", 80)));
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
