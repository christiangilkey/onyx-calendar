package com.onyxcalendar.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * What the home-screen widgets show, and how they get it. The widgets read straight
 * from Onyx on the PC (the same address and token the app pairs with, handed over by
 * OnyxWidgetPlugin), and keep the last answer so they still show something offline.
 */
final class WidgetData {
    private static final String PREFS = "onyx_widget";
    static final int WEEK = 7;    // the days a tall widget lists
    static final int WINDOW = 49; // the days fetched: the month grid (6 weeks) and a week past it

    private WidgetData() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------ the connection to the PC

    static void saveConnection(Context ctx, List<String> addresses, String last, String token) {
        prefs(ctx).edit()
            .putString("addresses", String.join(",", addresses))
            .putString("last", last == null ? "" : last)
            .putString("token", token == null ? "" : token)
            .apply();
    }

    static void clearConnection(Context ctx) {
        prefs(ctx).edit().remove("addresses").remove("last").remove("token").remove("data").apply();
    }

    static boolean paired(Context ctx) {
        return !prefs(ctx).getString("token", "").isEmpty() && !prefs(ctx).getString("addresses", "").isEmpty();
    }

    /** The PC's addresses, the one that answered last time first. */
    private static List<String> addresses(Context ctx) {
        List<String> out = new ArrayList<>();
        String last = prefs(ctx).getString("last", "");
        if (!last.isEmpty()) out.add(last);
        for (String a : prefs(ctx).getString("addresses", "").split(",")) {
            if (!a.trim().isEmpty() && !out.contains(a.trim())) out.add(a.trim());
        }
        return out;
    }

    private static String request(String address, String token, String method, String path, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("http://" + address + path).openConnection();
        try {
            c.setConnectTimeout(4000);
            c.setReadTimeout(8000);
            c.setRequestMethod(method);
            c.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
            }
            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            if (in != null) {
                byte[] chunk = new byte[16 * 1024];
                int n;
                while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
                in.close();
            }
            String text = buf.toString("UTF-8");
            if (code == 401) throw new IllegalStateException("The PC no longer accepts this phone. Pair it again in the app.");
            if (code >= 400) throw new Exception("The PC answered " + code);
            return text;
        } finally {
            c.disconnect();
        }
    }

    /** Calls the PC on whichever address answers, remembering it. */
    private static String call(Context ctx, String method, String path, String body) throws Exception {
        String token = prefs(ctx).getString("token", "");
        Exception last = new Exception("Not paired with a PC yet. Open Onyx and pair it.");
        for (String address : addresses(ctx)) {
            try {
                String text = request(address, token, method, path, body);
                prefs(ctx).edit().putString("last", address).apply();
                return text;
            } catch (IllegalStateException e) {
                throw e; // a refused token is the same on every address
            } catch (Exception e) {
                last = new Exception("Can't reach the PC");
            }
        }
        throw last;
    }

    /**
     * Fetches the agenda around `day` (from the top of its month's grid, for WINDOW days) and
     * the open tasks, and keeps them. On failure the last copy stays and the error is noted
     * for the widget's footer.
     */
    static void fetch(Context ctx, LocalDate day) {
        try {
            LocalDate start = gridStart(day);
            String q = "?start=" + URLEncoder.encode(start.toString(), "UTF-8") + "&days=" + WINDOW;
            JSONObject agenda = new JSONObject(call(ctx, "GET", "/api/agenda" + q, null));
            JSONObject tasks = new JSONObject(call(ctx, "GET", "/api/tasks", null));
            JSONObject data = new JSONObject();
            data.put("start", start.toString());
            data.put("events", agenda.optJSONArray("events") != null ? agenda.optJSONArray("events") : new JSONArray());
            data.put("tasks", tasks.optJSONArray("tasks") != null ? tasks.optJSONArray("tasks") : new JSONArray());
            prefs(ctx).edit()
                .putString("data", data.toString())
                .putLong("updated", System.currentTimeMillis())
                .putString("error", "")
                .apply();
        } catch (Exception e) {
            prefs(ctx).edit().putString("error", e.getMessage() == null ? "Can't reach the PC" : e.getMessage()).apply();
        }
    }

    /** Marks a task done on the PC (in Google Tasks / To Do), like ticking it in the app. */
    static void completeTask(Context ctx, String id) throws Exception {
        rpc(ctx, "task:update", new JSONArray().put(id).put(new JSONObject().put("done", true)));
    }

    /** Runs one of the app's commands on the PC (the same ones the app uses) and returns its value. */
    static Object rpc(Context ctx, String name, JSONArray args) throws Exception {
        JSONObject body = new JSONObject().put("name", name).put("args", args == null ? new JSONArray() : args);
        JSONObject res = new JSONObject(call(ctx, "POST", "/app/rpc", body.toString()));
        if (!res.optBoolean("ok", false)) throw new Exception(res.optString("error", "The PC could not do that."));
        return res.opt("value");
    }

    /** The phone's first day of the week (Monday or Sunday, by its language and region). */
    static DayOfWeek weekStart() {
        return WeekFields.of(Locale.getDefault()).getFirstDayOfWeek();
    }

    /** The first day in the month grid that holds `day`: the week start on or before the 1st. */
    static LocalDate gridStart(LocalDate day) {
        return day.withDayOfMonth(1).with(TemporalAdjusters.previousOrSame(weekStart()));
    }

    /** The last data fetched, or an empty set. */
    static JSONObject cached(Context ctx) {
        try {
            return new JSONObject(prefs(ctx).getString("data", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    // ------------------------------------------------------------ each widget's own choices

    static int dayOffset(Context ctx, int id) {
        return prefs(ctx).getInt("day_" + id, 0);
    }

    static void setDayOffset(Context ctx, int id, int offset) {
        prefs(ctx).edit().putInt("day_" + id, offset).apply();
    }

    static void forget(Context ctx, int id) {
        // mode_ and yaw_ were the globe's (before 1.12.1): cleared too.
        prefs(ctx).edit().remove("mode_" + id).remove("day_" + id).remove("yaw_" + id).apply();
    }
}
