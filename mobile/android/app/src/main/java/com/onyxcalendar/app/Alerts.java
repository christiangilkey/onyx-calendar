package com.onyxcalendar.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Everything going off now, and one way to turn it all off: the alarm ringing (AlarmService), and each entry
 * the Pi is calling or reminding about (its notification, the card on the lock screen and Onyx Home). It is
 * turned off here on the phone at once, whether the PC can be reached or not; the PC is told, so no more
 * calls come about it, straight away or as soon as it can be (the ones still to send are kept, and sent at
 * the next fetch and when the app opens).
 */
final class Alerts {
    private static final String LATER = "ack_later";

    private Alerts() {}

    /** The entries the Pi is calling or reminding about now. */
    static List<LauncherData.Item> calling(Context ctx) {
        long t = System.currentTimeMillis();
        List<LauncherData.Item> out = new ArrayList<>();
        for (LauncherData.Item it : LauncherData.items(ctx)) if (it.calling(t) != null) out.add(it);
        return out;
    }

    /** Whether anything is going off: the alarm ringing, or a call or reminder. */
    static boolean any(Context ctx) {
        return AlarmService.isRinging() || !calling(ctx).isEmpty();
    }

    /** For the app: { ringing: { id, title, start, kind } or null, calling: [{ id, title, start, kind }], later }. */
    static JSONObject state(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            if (AlarmService.isRinging()) {
                o.put("ringing", new JSONObject().put("id", AlarmService.ringingId()).put("title", AlarmService.ringingTitle())
                    .put("start", AlarmService.ringingStart()).put("kind", AlarmService.ringingKind()));
            } else {
                o.put("ringing", JSONObject.NULL);
            }
            JSONArray list = new JSONArray();
            for (LauncherData.Item it : calling(ctx)) list.put(new JSONObject().put("id", it.id).put("title", it.title).put("start", it.start).put("kind", it.kind));
            o.put("calling", list);
            o.put("later", later(ctx).length());
        } catch (Exception ignored) {
            // plain values
        }
        return o;
    }

    /**
     * Turns off everything going off now: the ringing stops, the call notification goes, and each entry is
     * marked seen here (the cards go) and the PC told. Returns how many things it turned off.
     */
    static int offAll(Context ctx) {
        Context app = ctx.getApplicationContext();
        int n = 0;
        SharedPreferences.Editor e = LauncherData.prefs(app).edit();
        List<String> ids = new ArrayList<>();
        if (AlarmService.isRinging()) {
            String id = AlarmService.ringingId();
            if (id != null && !id.isEmpty() && !id.startsWith("hyperfocus")) {
                e.putBoolean("ack_" + id + "_" + AlarmService.ringingStart(), true);
                ids.add(id);
            }
            AlarmService.stopNow(app);
            n++;
        }
        for (LauncherData.Item it : calling(app)) {
            e.putBoolean("ack_" + it.id + "_" + it.start, true);
            if (!ids.contains(it.id)) { ids.add(it.id); n++; }
        }
        e.apply();
        NotificationManager nm = app.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(OnyxLiveService.ID_CALL);
        for (String id : ids) keep(app, id, false);
        sendSoon(app);
        AlarmActivity.planNext(app); // no alarm set again for what was just turned off
        OnyxLiveService.poke(app);
        return n;
    }

    /**
     * One entry turned off (Leaving now, or Done for a task): seen here at once, its alarm stopped if it is
     * the one ringing, and the PC told now or later.
     */
    static void off(Context ctx, String id, long start, boolean done) {
        Context app = ctx.getApplicationContext();
        if (id == null || id.isEmpty()) return;
        LauncherData.prefs(app).edit().putBoolean("ack_" + id + "_" + start, true).apply();
        if (AlarmService.isRinging() && id.equals(AlarmService.ringingId())) AlarmService.stopNow(app);
        NotificationManager nm = app.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(OnyxLiveService.ID_CALL);
        keep(app, id, done);
        sendSoon(app);
        AlarmActivity.planNext(app);
        OnyxLiveService.poke(app);
    }

    // ------------------------------------------------------------ telling the PC (now, or when it can be reached)

    /** The ones still to send: [{ id, done }]. */
    static JSONArray later(Context ctx) {
        try {
            return new JSONArray(LauncherData.prefs(ctx).getString(LATER, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static synchronized void keep(Context ctx, String id, boolean done) {
        JSONArray list = later(ctx), out = new JSONArray();
        boolean was = false;
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            if (id.equals(o.optString("id"))) { was = true; try { o.put("done", o.optBoolean("done") || done); } catch (Exception ignored) { /* as it was */ } }
            out.put(o);
        }
        if (!was) {
            try {
                out.put(new JSONObject().put("id", id).put("done", done));
            } catch (Exception ignored) {
                // plain values
            }
        }
        LauncherData.prefs(ctx).edit().putString(LATER, out.toString()).apply();
    }

    /** Hands the app the ones still to send (it sends them its own way, through the PC or Google Drive). */
    static synchronized JSONArray take(Context ctx) {
        JSONArray list = later(ctx);
        LauncherData.prefs(ctx).edit().putString(LATER, "[]").apply();
        return list;
    }

    static void sendSoon(Context ctx) {
        new Thread(() -> send(ctx), "onyx-ack").start();
    }

    /** Tells the PC about each one still to send; what it can't reach stays for next time. */
    static synchronized void send(Context ctx) {
        JSONArray list = later(ctx), keep = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            try {
                if (o.optBoolean("done")) WidgetData.completeTask(ctx, o.optString("id"));
                WidgetData.rpc(ctx, "event:ack", new JSONArray().put(o.optString("id")));
            } catch (Exception e) {
                keep.put(o);
            }
        }
        LauncherData.prefs(ctx).edit().putString(LATER, keep.toString()).apply();
    }
}
