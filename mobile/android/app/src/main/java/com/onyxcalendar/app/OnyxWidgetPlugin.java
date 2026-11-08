package com.onyxcalendar.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import androidx.activity.result.ActivityResult;

import java.util.ArrayList;
import java.util.List;

/**
 * Hands the PC's address and token from the app to the home-screen widgets (they fetch
 * from the PC themselves), and asks them to refresh after a change in the app. Also opens
 * news videos in Tamkeen, the Arabic study app, when it is installed.
 */
@CapacitorPlugin(name = "OnyxWidget", permissions = {
    // "Hey Claude" listens through the microphone (asked for when it is turned on).
    @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "microphone")
})
public class OnyxWidgetPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        if (call.getBoolean("clear", false)) {
            WidgetData.clearConnection(getContext());
            OnyxWidget.renderAll(getContext());
            call.resolve();
            return;
        }
        List<String> addresses = new ArrayList<>();
        JSArray list = call.getArray("addresses", new JSArray());
        for (int i = 0; i < list.length(); i++) {
            String a = list.optString(i, "");
            if (!a.isEmpty()) addresses.add(a);
        }
        WidgetData.saveConnection(getContext(), addresses, call.getString("last", ""), call.getString("token", ""));
        OnyxWidget.refreshAll(getContext());
        OnyxLiveService.poke(getContext()); // also starts it, with the app open, if it should be on the lock screen
        call.resolve();
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        OnyxWidget.refreshAll(getContext());
        OnyxLiveService.poke(getContext());
        call.resolve();
    }

    // ------------------------------------------------------------ Onyx Home and the lock screen

    private JSObject launcherState() {
        try {
            return JSObject.fromJSONObject(LauncherData.info(getContext()));
        } catch (Exception e) {
            return new JSObject();
        }
    }

    /** Where Onyx shows (home, lock, both, off), whether Onyx Home is the home app, and Android's switches for it. */
    /**
     * How far the status bar (top) and the navigation bar (bottom) really cover the page, in CSS
     * pixels. Android may already keep the page clear of them, and the WebView's own
     * env(safe-area-inset-*) does not always know, which left an empty band under the top bar.
     */
    @PluginMethod
    public void insets(PluginCall call) {
        WebView wv = getBridge().getWebView();
        wv.post(() -> {
            JSObject o = new JSObject();
            try {
                WindowInsetsCompat w = ViewCompat.getRootWindowInsets(wv);
                if (w == null) {
                    o.put("known", false);
                } else {
                    Insets bars = w.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                    int[] at = new int[2];
                    wv.getLocationInWindow(at);
                    int windowH = wv.getRootView().getHeight();
                    float d = wv.getResources().getDisplayMetrics().density;
                    int top = Math.max(0, bars.top - at[1]);
                    int bottom = Math.max(0, (at[1] + wv.getHeight()) - (windowH - bars.bottom));
                    o.put("known", true);
                    o.put("top", top / d);
                    o.put("bottom", bottom / d);
                }
            } catch (Exception e) {
                o.put("known", false);
            }
            call.resolve(o);
        });
    }

    @PluginMethod
    public void launcherInfo(PluginCall call) {
        call.resolve(launcherState());
    }

    @PluginMethod
    public void setLauncher(PluginCall call) {
        if (call.hasOption("show")) LauncherData.setShow(getContext(), call.getString("show", LauncherData.SHOW_HOME));
        if (call.hasOption("alarm")) LauncherData.setAlarm(getContext(), Boolean.TRUE.equals(call.getBoolean("alarm", true)));
        if (call.hasOption("cover")) LauncherData.setCover(getContext(), Boolean.TRUE.equals(call.getBoolean("cover", false)));
        // The doomscroll saver: on or off, and after how many minutes on social media.
        if (call.hasOption("doomscroll") || call.hasOption("doomMinutes")) {
            DoomscrollService.set(getContext(),
                call.hasOption("doomscroll") ? Boolean.TRUE.equals(call.getBoolean("doomscroll", false)) : null,
                call.hasOption("doomMinutes") ? Integer.valueOf(call.getData().optInt("doomMinutes", DoomscrollService.DEFAULT_MINUTES)) : null);
        }
        // Which apps count: the built-in names left out, and the apps added ([{ pkg, label }]).
        if (call.hasOption("doomOff") || call.hasOption("doomExtra")) {
            DoomscrollService.setApps(getContext(),
                call.hasOption("doomOff") ? call.getData().optJSONArray("doomOff") : null,
                call.hasOption("doomExtra") ? call.getData().optJSONArray("doomExtra") : null);
        }
        // The daily limits: { name: minutes } for all of them (one left out has none).
        if (call.hasOption("doomLimits")) DoomscrollService.setLimits(getContext(), call.getData().optJSONObject("doomLimits"));
        call.resolve(launcherState());
    }

    /** Settings → Doomscroll saver → Show me: the corner card for ten seconds ({ shown: false } until Accessibility is on). */
    @PluginMethod
    public void doomscrollPreview(PluginCall call) {
        JSObject o = new JSObject();
        o.put("shown", DoomscrollService.preview());
        call.resolve(o);
    }

    /** A Hyperfocus session on this phone (or { clear: true } when it is over), for Onyx Home and the lock screen. */
    @PluginMethod
    public void setFocus(PluginCall call) {
        if (Boolean.TRUE.equals(call.getBoolean("clear", false))) {
            LauncherData.setFocus(getContext(), null, 0, 0);
        } else {
            // Times in ms arrive as longs (getDouble only takes doubles and ints): read them as numbers of any kind.
            long start = call.getData().optLong("startedAt", System.currentTimeMillis());
            long end = call.getData().optLong("plannedEnd", 0);
            LauncherData.setFocus(getContext(), call.getString("goal", "Hyperfocus"), start, end);
        }
        call.resolve();
    }

    /** The alarms coming up, from the app: Android's alarm clock is set for the first (AlarmActivity.planNext). */
    @PluginMethod
    public void setAlarms(PluginCall call) {
        try {
            AlarmActivity.setFromApp(getContext(), call.getArray("alarms", new JSArray()));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Opens where one of them is turned on: home, notifications, overlay, fullscreen, or Onyx Home itself. */
    @PluginMethod
    public void launcherOpen(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Onyx isn't open.");
            return;
        }
        LauncherData.open(getActivity(), call.getString("what", ""));
        call.resolve();
    }

    /**
     * Everything going off on the phone (Alerts): { ringing, calling, later }. { off: true } turns it all off
     * first ({ turnedOff: n }); { take: true } also hands over the ones the PC still has to be told about
     * ({ toSend: [{ id, done }] }), for the app to send its own way.
     */
    @PluginMethod
    public void alerts(PluginCall call) {
        android.content.Context c = getContext();
        int off = call.getBoolean("off", false) ? Alerts.offAll(c) : 0;
        JSObject out;
        try {
            out = JSObject.fromJSONObject(Alerts.state(c));
        } catch (Exception e) {
            out = new JSObject();
        }
        out.put("turnedOff", off);
        if (call.getBoolean("take", false)) {
            try {
                out.put("toSend", new JSArray(Alerts.take(c).toString()));
            } catch (Exception e) {
                out.put("toSend", new JSArray());
            }
        }
        call.resolve(out);
    }

    /**
     * The noise machine (NoiseService), played on the phone itself: { play: kind, volume?, minutes? } plays or
     * changes the sound, { stop: true } stops it, { volume } alone changes how loud. Any of them, or {}, answers
     * with how it is: { playing, kind, name, volume, minutes, endsAt, kinds }.
     */
    @PluginMethod
    public void noise(PluginCall call) {
        android.content.Context c = getContext();
        if (call.getBoolean("stop", false)) NoiseService.stop(c);
        else if (call.hasOption("play")) NoiseService.play(c, call.getString("play", "brown"), call.getInt("volume", NoiseService.volume(c)), call.getInt("minutes", 0));
        else if (call.hasOption("volume")) NoiseService.setVolume(c, call.getInt("volume", NoiseService.volume(c)));
        try {
            call.resolve(JSObject.fromJSONObject(NoiseService.state(c)));
        } catch (Exception e) {
            call.resolve(new JSObject());
        }
    }

    // ---- each screen's editor (the lock screen's, Onyx Home's): its layout (LockLayout) and your shortcuts on it (LockShortcuts)

    private JSObject lockSetup(String screen) {
        JSObject o = new JSObject();
        try {
            o.put("screen", screen);
            o.put("layout", LockLayout.get(getContext(), screen));
            o.put("shortcuts", LockShortcuts.list(getContext(), screen));
            o.put("max", LockShortcuts.MAX);
            // For the editor's preview, drawn to scale: what the cards show now, and the screen they show on.
            o.put("panel", OnyxPanel.preview(getContext()));
            o.put("phone", phoneScreen());
        } catch (Exception ignored) {
            // plain values
        }
        return o;
    }

    /** The screen in dp, with its bars (status bar, cutout, navigation) at the top and bottom: { w, h, top, bottom }. */
    @SuppressWarnings("deprecation")
    private org.json.JSONObject phoneScreen() {
        org.json.JSONObject o = new org.json.JSONObject();
        try {
            android.util.DisplayMetrics m = new android.util.DisplayMetrics();
            getActivity().getWindowManager().getDefaultDisplay().getRealMetrics(m);
            float d = m.density;
            o.put("w", m.widthPixels / d).put("h", m.heightPixels / d);
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            if (insets != null) {
                Insets bars = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                o.put("top", bars.top / d).put("bottom", bars.bottom / d);
            }
        } catch (Exception ignored) {
            // the preview's own guess instead
        }
        return o;
    }

    /** { screen, layout, shortcuts, max, panel, phone } for { screen: "lock" (the default) | "home" }. */
    @PluginMethod
    public void lockSetup(PluginCall call) {
        call.resolve(lockSetup(LockLayout.screen(call.getString("screen", LockLayout.LOCK))));
    }

    /**
     * Saves either or both ({ screen?, layout?, shortcuts? }): the lock screen shows them the next time it
     * turns on, Onyx Home the next time it comes to the front.
     */
    @PluginMethod
    public void setLockSetup(PluginCall call) {
        String screen = LockLayout.screen(call.getString("screen", LockLayout.LOCK));
        if (call.hasOption("layout")) LockLayout.save(getContext(), screen, call.getObject("layout"));
        if (call.hasOption("shortcuts")) LockShortcuts.save(getContext(), screen, call.getArray("shortcuts"));
        call.resolve(lockSetup(screen));
    }

    /** The apps a shortcut can open: { apps: [{ pkg, label }] }. */
    @PluginMethod
    public void shortcutApps(PluginCall call) {
        JSObject o = new JSObject();
        o.put("apps", LockShortcuts.apps(getContext()));
        call.resolve(o);
    }

    /** Android's file picker; { uri, name, type } of the file picked (kept openable after a restart), or { cancelled }. */
    @PluginMethod
    public void pickShortcutFile(PluginCall call) {
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, pick, "pickedShortcutFile");
    }

    @ActivityCallback
    private void pickedShortcutFile(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        JSObject o = new JSObject();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
            o.put("cancelled", true);
            call.resolve(o);
            return;
        }
        LockShortcuts.keep(getContext(), uri);
        o.put("uri", uri.toString());
        o.put("name", LockShortcuts.nameOf(getContext(), uri));
        String type = getContext().getContentResolver().getType(uri);
        o.put("type", type == null ? "" : type);
        call.resolve(o);
    }

    /** Opens a shortcut now, as the lock screen would ({ shortcut }): to try one while setting it up. */
    @PluginMethod
    public void tryShortcut(PluginCall call) {
        JSObject s = call.getObject("shortcut");
        if (s == null || !LockShortcuts.open(getContext(), s)) {
            call.reject("Nothing on this phone can open that.");
            return;
        }
        call.resolve();
    }

    private static final String TAMKEEN = "io.github.christiangilkey.arabicpodcaststudio";

    /** Whether Tamkeen is installed (the manifest's <queries> lets the app see it). */
    @PluginMethod
    public void tamkeenInstalled(PluginCall call) {
        boolean installed;
        try {
            getContext().getPackageManager().getPackageInfo(TAMKEEN, 0);
            installed = true;
        } catch (PackageManager.NameNotFoundException e) {
            installed = false;
        }
        JSObject out = new JSObject();
        out.put("installed", installed);
        call.resolve(out);
    }

    /** Opens a YouTube video in Tamkeen's player through its link, tamkeen://watch?v=<id>. */
    @PluginMethod
    public void openTamkeen(PluginCall call) {
        String id = call.getString("id", "");
        if (id == null || !id.matches("[A-Za-z0-9_-]{11}")) {
            call.reject("That is not a YouTube video.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("tamkeen://watch?v=" + id + "&from=onyx"));
        intent.setPackage(TAMKEEN);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            // Installed, but a version from before Tamkeen took these links.
            call.reject("Update Tamkeen to its newest version, so it can open videos from Onyx.", "OUTDATED");
        }
    }

    // ---- "Hey Claude" (VoiceService): listening for the phrase on this phone, with its speech model (VoiceModel)

    /**
     * { on } turns listening on or off (asking for the microphone first), { download } fetches the speech model,
     * { cancel } stops that, { remove } takes it off the phone; { phrase, claude, chime } change its settings;
     * { take } lists the tasks said aloud that wait, on a phone with no PC ({ items }), and { done: [op] } drops
     * the ones the app made. Each answers with how it is now (VoiceService.state).
     */
    @PluginMethod
    public void voice(PluginCall call) {
        android.content.Context c = getContext();
        if (call.getBoolean("take", false)) {
            JSObject out = new JSObject();
            try {
                out.put("items", new JSArray(WidgetData.waitingVoice(c).toString()));
            } catch (Exception e) {
                out.put("items", new JSArray());
            }
            call.resolve(out);
            return;
        }
        if (call.hasOption("done")) {
            java.util.Set<String> ops = new java.util.HashSet<>();
            JSArray list = call.getArray("done", new JSArray());
            for (int i = 0; i < list.length(); i++) ops.add(list.optString(i, ""));
            WidgetData.dropVoice(c, ops);
        }
        if (call.hasOption("phrase")) VoiceService.setPhrase(c, call.getString("phrase", VoiceWake.DEFAULT));
        if (call.hasOption("claude")) VoiceService.setClaude(c, call.getBoolean("claude", true));
        if (call.hasOption("chime")) VoiceService.setChime(c, call.getBoolean("chime", true));
        if (call.getBoolean("download", false)) VoiceModel.download(c);
        if (call.getBoolean("cancel", false)) VoiceModel.cancel();
        if (call.getBoolean("remove", false)) {
            VoiceService.stop(c);
            VoiceModel.remove(c);
            VoiceService.forgetModel();
        }
        if (call.hasOption("on")) {
            if (!call.getBoolean("on", false)) VoiceService.stop(c);
            else if (getPermissionState("microphone") != PermissionState.GRANTED) {
                requestPermissionForAlias("microphone", call, "voiceMicAnswered");
                return;
            } else {
                VoiceService.start(c);
                askNotifications();
            }
        }
        call.resolve(voiceState());
    }

    @PermissionCallback
    private void voiceMicAnswered(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            VoiceService.start(getContext());
            askNotifications();
        }
        call.resolve(voiceState());
    }

    /** "Added to Onyx" and Undo come as a notification: Android 13 and later ask for those once. */
    private void askNotifications() {
        if (android.os.Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        if (getContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        getActivity().requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, 4103);
    }

    private JSObject voiceState() {
        try {
            JSObject o = JSObject.fromJSONObject(VoiceService.state(getContext()));
            o.put("micAsk", getPermissionState("microphone") == PermissionState.DENIED ? "denied" : "ok");
            return o;
        } catch (Exception e) {
            JSObject o = new JSObject();
            o.put("available", true);
            return o;
        }
    }
}
