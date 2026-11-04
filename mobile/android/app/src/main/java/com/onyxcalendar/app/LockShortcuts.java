package com.onyxcalendar.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.LauncherActivityInfo;
import android.content.pm.LauncherApps;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Process;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Your own shortcuts on the Onyx panel over the lock screen, and on Onyx Home, set in the app (Settings, Home
 * and lock screen), a list for each screen:
 * each a name, an icon (an emoji, or the app's own) and what it opens: a link (a web page, or an app's own
 * link such as spotify: or tel:), an app, or a file picked on the phone. A tap unlocks and opens it.
 * Kept on the phone as a list per screen, in the order they show. The home screen starts with none.
 */
final class LockShortcuts {
    static final int MAX = 12;
    private static final String KEY = "shortcuts", HOME_KEY = "homeShortcuts";

    private LockShortcuts() {}

    private static String key(String screen) {
        return LockLayout.HOME.equals(screen) ? HOME_KEY : KEY;
    }

    /** The lock screen's list. */
    static JSONArray list(Context ctx) {
        return list(ctx, LockLayout.LOCK);
    }

    /** That screen's list as saved: [{ id, label, icon, kind: link | app | file, target, name?, type? }]. */
    static JSONArray list(Context ctx, String screen) {
        try {
            return new JSONArray(LauncherData.prefs(ctx).getString(key(screen), "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static JSONArray save(Context ctx, JSONArray in) {
        return save(ctx, LockLayout.LOCK, in);
    }

    /** Keeps the ones that make sense, in their order, at most MAX, for that screen. */
    static JSONArray save(Context ctx, String screen, JSONArray in) {
        JSONArray out = new JSONArray();
        for (int i = 0; in != null && i < in.length() && out.length() < MAX; i++) {
            JSONObject s = in.optJSONObject(i);
            if (s == null) continue;
            String kind = s.optString("kind"), target = s.optString("target").trim();
            if (!kind.equals("link") && !kind.equals("app") && !kind.equals("file")) continue;
            if (target.isEmpty()) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("id", s.optString("id", Long.toString(System.nanoTime(), 36)));
                o.put("label", s.optString("label").trim());
                o.put("icon", s.optString("icon").trim());
                o.put("kind", kind);
                o.put("target", target);
                if (s.has("name")) o.put("name", s.optString("name"));
                if (s.has("type")) o.put("type", s.optString("type"));
                out.put(o);
            } catch (Exception ignored) {
                // one bad entry is left out
            }
        }
        LauncherData.prefs(ctx).edit().putString(key(screen), out.toString()).apply();
        return out;
    }

    /** The intent that opens one, or null when there is nothing to open it with. */
    static Intent intent(Context ctx, JSONObject s) {
        String kind = s.optString("kind"), target = s.optString("target");
        Intent i = null;
        try {
            switch (kind) {
                case "app":
                    i = ctx.getPackageManager().getLaunchIntentForPackage(target);
                    break;
                case "file": {
                    Uri uri = Uri.parse(target);
                    String type = s.optString("type", "");
                    if (type.isEmpty()) type = ctx.getContentResolver().getType(uri);
                    i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type == null || type.isEmpty() ? "*/*" : type)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    // Passes the read right on to whichever app opens it (Drive's files among them).
                    i.setClipData(android.content.ClipData.newRawUri("", uri));
                    break;
                }
                default: {
                    String t = target.matches("^[a-zA-Z][a-zA-Z0-9+.-]*:.*") ? target : "https://" + target; // "example.com" is a web page
                    i = new Intent(Intent.ACTION_VIEW, Uri.parse(t));
                }
            }
        } catch (Exception e) {
            return null;
        }
        if (i == null) return null;
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** Opens one; false when nothing on the phone can. */
    static boolean open(Context ctx, JSONObject s) {
        Intent i = intent(ctx, s);
        if (i == null) return false;
        try {
            ctx.startActivity(i);
            return true;
        } catch (Exception e) {
            // A file whose kind no app claims (a Google Doc from Drive, say): offer every app that opens files.
            if (!"file".equals(s.optString("kind")) || i.getData() == null) return false;
            try {
                Intent any = new Intent(Intent.ACTION_VIEW).setDataAndType(i.getData(), "*/*")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                any.setClipData(i.getClipData());
                ctx.startActivity(Intent.createChooser(any, s.optString("name", "Open with")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return true;
            } catch (Exception again) {
                return false;
            }
        }
    }

    /** The apps on the phone that can be opened, by name: [{ pkg, label }]. */
    static JSONArray apps(Context ctx) {
        List<JSONObject> list = new ArrayList<>();
        try {
            LauncherApps la = ctx.getSystemService(LauncherApps.class);
            for (LauncherActivityInfo info : la.getActivityList(null, Process.myUserHandle())) {
                String pkg = info.getApplicationInfo().packageName;
                if (pkg.equals(ctx.getPackageName())) continue;
                JSONObject o = new JSONObject();
                o.put("pkg", pkg);
                o.put("label", String.valueOf(info.getLabel()));
                list.add(o);
            }
        } catch (Exception ignored) {
            // no list: links and files still work
        }
        list.sort((a, b) -> a.optString("label").compareToIgnoreCase(b.optString("label")));
        JSONArray out = new JSONArray();
        for (JSONObject o : list) out.put(o);
        return out;
    }

    /** Keeps the right to open a picked file after Onyx restarts. */
    static void keep(Context ctx, Uri uri) {
        try {
            ctx.getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
            // a provider that doesn't keep them: it opens while it can
        }
    }

    /** A picked file's name, for the label. */
    static String nameOf(Context ctx, Uri uri) {
        try (android.database.Cursor c = ctx.getContentResolver().query(uri, new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // no name to read
        }
        String last = uri.getLastPathSegment();
        return last == null ? "File" : last;
    }

    /**
     * The row for the lock panel: one chip per shortcut, sideways when there are more than fit. `open` is
     * given what to open once the phone is unlocked. Empty (and gone) with none set.
     */
    static View row(Activity a, Consumer<JSONObject> open) {
        return row(a, LockLayout.LOCK, open);
    }

    /** The same for that screen (Onyx Home has its own list). */
    static View row(Activity a, String screen, Consumer<JSONObject> open) {
        JSONArray list = list(a, screen);
        HorizontalScrollView scroll = new HorizontalScrollView(a);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setVisibility(list.length() == 0 ? View.GONE : View.VISIBLE);
        LinearLayout line = new LinearLayout(a);
        line.setOrientation(LinearLayout.HORIZONTAL);
        scroll.addView(line);
        for (int i = 0; i < list.length(); i++) {
            JSONObject s = list.optJSONObject(i);
            if (s != null) line.addView(chip(a, s, open));
        }
        return scroll;
    }

    private static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    private static View chip(Activity a, JSONObject s, Consumer<JSONObject> open) {
        LinearLayout chip = new LinearLayout(a);
        chip.setOrientation(LinearLayout.HORIZONTAL);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setPadding(dp(a, 12), dp(a, 9), dp(a, 14), dp(a, 9));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x26FFFFFF);
        bg.setCornerRadius(dp(a, 999));
        chip.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.rightMargin = dp(a, 8);
        chip.setLayoutParams(lp);

        String icon = s.optString("icon");
        Drawable appIcon = null;
        if (icon.isEmpty() && "app".equals(s.optString("kind"))) {
            try {
                appIcon = a.getPackageManager().getApplicationIcon(s.optString("target"));
            } catch (Exception ignored) {
                // gone from the phone: the default mark instead
            }
        }
        if (appIcon != null) {
            ImageView img = new ImageView(a);
            img.setImageDrawable(appIcon);
            LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(a, 20), dp(a, 20));
            ip.rightMargin = dp(a, 7);
            chip.addView(img, ip);
        } else {
            TextView mark = new TextView(a);
            mark.setText(icon.isEmpty() ? ("file".equals(s.optString("kind")) ? "📄" : "app".equals(s.optString("kind")) ? "▦" : "🔗") : icon);
            mark.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            mark.setTextColor(Color.WHITE);
            mark.setPadding(0, 0, dp(a, 7), 0);
            chip.addView(mark);
        }
        TextView label = new TextView(a);
        label.setText(labelOf(s));
        label.setTextColor(Color.WHITE);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        label.setMaxWidth(dp(a, 160));
        chip.addView(label);
        chip.setContentDescription("Open " + labelOf(s));
        chip.setOnClickListener(v -> open.accept(s));
        return chip;
    }

    static String labelOf(JSONObject s) {
        String l = s.optString("label");
        if (!l.isEmpty()) return l;
        String n = s.optString("name");
        if (!n.isEmpty()) return n;
        return s.optString("target");
    }
}
