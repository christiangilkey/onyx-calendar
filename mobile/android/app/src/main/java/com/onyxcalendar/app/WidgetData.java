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

    /** The PC answered that it doesn't know the command: it runs an older Onyx. */
    static final class Unknown extends RuntimeException {
        Unknown() { super("Unknown command"); }
    }

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
            if (code == 404 && text.contains("Unknown command")) throw new Unknown(); // an older Onyx on the PC
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
            } catch (IllegalStateException | Unknown e) {
                throw e; // a refused token, or a command the PC doesn't know, is the same on every address
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
        flushQuick(ctx); // tasks typed on the lock screen while the PC was out of reach
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

    // ---- quick add: a task typed on the lock screen or Onyx Home goes to the tasks with no date. Sent at
    // once; with the PC out of reach it waits here (through a restart) and goes with the next look at the
    // PC (the widgets' refresh, the panel opening), each made once even if sent twice.
    private static final String QUICK = "quick";

    static int quickWaiting(Context ctx) {
        try { return new JSONArray(prefs(ctx).getString(QUICK, "[]")).length(); } catch (Exception e) { return 0; }
    }

    /** Adds a task with no date; true once the PC has it, false while it waits for the PC. */
    static boolean quickTask(Context ctx, String title) {
        synchronized (WidgetData.class) {
            try {
                JSONArray q = new JSONArray(prefs(ctx).getString(QUICK, "[]"));
                q.put(new JSONObject().put("op", "quick-" + java.util.UUID.randomUUID()).put("title", title));
                prefs(ctx).edit().putString(QUICK, q.toString()).apply();
            } catch (Exception ignored) {
                // not kept: sent below all the same
            }
        }
        return flushQuick(ctx);
    }

    /** Sends the waiting quick tasks, oldest first; true when none is left waiting. */
    static synchronized boolean flushQuick(Context ctx) {
        JSONArray q;
        try { q = new JSONArray(prefs(ctx).getString(QUICK, "[]")); } catch (Exception e) { return true; }
        if (q.length() == 0) return true;
        JSONArray left = new JSONArray();
        boolean reach = true;
        for (int i = 0; i < q.length(); i++) {
            JSONObject o = q.optJSONObject(i);
            if (o == null) continue;
            if (!reach) { left.put(o); continue; }
            try {
                if (o.optBoolean("voice", false)) sendVoice(ctx, o.optString("title"), o.optBoolean("claude", true), o.optString("op"));
                // Marked as from the lock screen: it waits in the app's inbox (the tray by the date) until it is dealt with.
                else rpc(ctx, "task:create", new JSONArray().put(new JSONObject().put("title", o.optString("title")).put("inbox", "lock")), o.optString("op"));
            } catch (IllegalStateException refused) {
                reach = false; // this phone is no longer paired: kept for when it is again
                left.put(o);
            } catch (Exception e) {
                String m = e.getMessage() == null ? "" : e.getMessage();
                if (m.startsWith("Can't reach") || m.startsWith("Not paired") || m.startsWith("The PC answered")) {
                    reach = false;
                    left.put(o);
                } // else the PC turned it down (an empty name, say): nothing to try again
            }
        }
        prefs(ctx).edit().putString(QUICK, left.toString()).apply();
        return left.length() == 0;
    }

    // ---- "Hey Claude" (VoiceService): what was said after it goes to the PC, which reads the day and time out
    // of it and puts the task in the inbox ('voice:task'). An older Onyx on the PC gets it as a plain task.
    // With the PC out of reach it waits in the same queue as the lock screen's quick tasks.

    /** Sends one; throws like rpc() when the PC can't be reached. Its answer: { taskId, title, date, time }. */
    static JSONObject sendVoice(Context ctx, String text, boolean claude, String op) throws Exception {
        try {
            Object v = rpc(ctx, "voice:task", new JSONArray().put(text).put(new JSONObject().put("claude", claude)), op);
            return v instanceof JSONObject ? (JSONObject) v : new JSONObject().put("title", text);
        } catch (Unknown older) {
            String title = text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
            Object v = rpc(ctx, "task:create", new JSONArray().put(new JSONObject().put("title", title).put("inbox", "voice")), op);
            JSONObject o = new JSONObject().put("title", title);
            if (v instanceof JSONObject) o.put("taskId", ((JSONObject) v).optString("id", ""));
            return o;
        }
    }

    /** A task said aloud: { state: added | waiting | failed, title, date, time, taskId, error }. */
    static JSONObject voiceTask(Context ctx, String text, boolean claude) {
        String op = "voice-" + java.util.UUID.randomUUID();
        JSONObject out = new JSONObject();
        try {
            if (quickWaiting(ctx) > 0) flushQuick(ctx); // any said earlier, first
            JSONObject r = sendVoice(ctx, text, claude, op);
            out.put("state", "added");
            for (String k : new String[] { "taskId", "title", "date", "time", "by" }) if (r.has(k) && !r.isNull(k)) out.put(k, r.opt(k));
            return out;
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage();
            boolean later = e instanceof IllegalStateException || m.startsWith("Can't reach") || m.startsWith("Not paired") || m.startsWith("The PC answered");
            try {
                if (later) {
                    synchronized (WidgetData.class) {
                        JSONArray q = new JSONArray(prefs(ctx).getString(QUICK, "[]"));
                        q.put(new JSONObject().put("op", op).put("title", text).put("voice", true).put("claude", claude));
                        prefs(ctx).edit().putString(QUICK, q.toString()).apply();
                    }
                    out.put("state", "waiting").put("title", text);
                } else {
                    out.put("state", "failed").put("title", text).put("error", m.isEmpty() ? "The PC couldn't add it." : m);
                }
            } catch (Exception ignored) {
                // plain answer
            }
            return out;
        }
    }

    /** How many said aloud wait for the PC. */
    static int voiceWaiting(Context ctx) {
        try {
            JSONArray q = new JSONArray(prefs(ctx).getString(QUICK, "[]"));
            int n = 0;
            for (int i = 0; i < q.length(); i++) if (q.optJSONObject(i) != null && q.optJSONObject(i).optBoolean("voice", false)) n++;
            return n;
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * A phone that works with no PC: the tasks said aloud that wait, for the app to make with its own engine
     * (then dropVoice). With a PC paired, none: they go to the PC.
     */
    static synchronized JSONArray waitingVoice(Context ctx) {
        JSONArray mine = new JSONArray();
        if (paired(ctx)) return mine;
        try {
            JSONArray q = new JSONArray(prefs(ctx).getString(QUICK, "[]"));
            for (int i = 0; i < q.length(); i++) {
                JSONObject o = q.optJSONObject(i);
                if (o != null && o.optBoolean("voice", false)) mine.put(o);
            }
        } catch (Exception ignored) {
            // none
        }
        return mine;
    }

    /** The ones the app made (by their op ids), out of the queue. */
    static synchronized void dropVoice(Context ctx, java.util.Set<String> ops) {
        try {
            JSONArray q = new JSONArray(prefs(ctx).getString(QUICK, "[]")), left = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                JSONObject o = q.optJSONObject(i);
                if (o != null && !(o.optBoolean("voice", false) && ops.contains(o.optString("op")))) left.put(o);
            }
            prefs(ctx).edit().putString(QUICK, left.toString()).apply();
        } catch (Exception ignored) {
            // kept
        }
    }

    /** Undo on "Added to Onyx": the task is deleted again. */
    static boolean undoVoiceTask(Context ctx, String id) {
        try {
            rpc(ctx, "task:delete", new JSONArray().put(id));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Marks a task done on the PC (in Google Tasks / To Do), like ticking it in the app. */
    static void completeTask(Context ctx, String id) throws Exception {
        rpc(ctx, "task:update", new JSONArray().put(id).put(new JSONObject().put("done", true)));
    }

    /** Runs one of the app's commands on the PC (the same ones the app uses) and returns its value. */
    static Object rpc(Context ctx, String name, JSONArray args) throws Exception {
        return rpc(ctx, name, args, null);
    }

    /** The same, with an id the PC remembers: one sent twice (its answer lost on the way) is made once. */
    static Object rpc(Context ctx, String name, JSONArray args, String op) throws Exception {
        JSONObject body = new JSONObject().put("name", name).put("args", args == null ? new JSONArray() : args);
        if (op != null) body.put("op", op);
        JSONObject res = new JSONObject(call(ctx, "POST", "/app/rpc", body.toString()));
        // The PC's own connection dropped: nothing was made, so it counts as out of reach (kept, sent later).
        if (!res.optBoolean("ok", false) && res.optBoolean("retry", false)) throw new Exception("Can't reach the internet from the PC right now.");
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
