package com.onyxcalendar.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.LauncherActivityInfo;
import android.content.pm.LauncherApps;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
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

import androidx.core.graphics.drawable.RoundedBitmapDrawable;
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Your own shortcuts on the Onyx panel over the lock screen, and on Onyx Home, set in the app (Settings, Home
 * and lock screen), a list for each screen:
 * each a name, an icon (an emoji, a picture of your own, or the app's own) and what it opens: a link (a web page, or an app's own
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

    /** That screen's list as saved: [{ id, label, icon, image?, kind: link | app | file, target, name?, type? }]. */
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
                // A picture of your own in the emoji's place: the name of its file (ShortcutImages), never a path.
                String image = s.optString("image").trim();
                if (ShortcutImages.valid(image)) o.put("image", image);
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
     * The part for the lock panel: your shortcuts as tiles of a bento box, or a row of pills that scrolls
     * sideways, as the screen's editor says (LockLayout shortcutLook). `open` is given what to open once the
     * phone is unlocked. Gone with none set.
     */
    static View row(Activity a, Consumer<JSONObject> open) {
        return row(a, LockLayout.LOCK, open);
    }

    /** The same for that screen (Onyx Home has its own list, and its own look). */
    static View row(Activity a, String screen, Consumer<JSONObject> open) {
        JSONArray list = list(a, screen);
        if ("tiles".equals(LockLayout.get(a, screen).optString("shortcutLook"))) return tiles(a, list, open);
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

        View mark = mark(a, s, 20);
        ((LinearLayout.LayoutParams) mark.getLayoutParams()).rightMargin = dp(a, 7);
        chip.addView(mark);
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

    /**
     * A shortcut's icon, `size` dp across: your own picture (ShortcutImages), the app's own, or its emoji (a mark
     * for its kind when it has none). A picture whose file is gone falls back to the emoji.
     */
    private static View mark(Activity a, JSONObject s, int size) {
        String icon = s.optString("icon"), kind = s.optString("kind");
        Bitmap pic = ShortcutImages.load(a, s.optString("image"));
        if (pic != null) {
            int px = dp(a, size);
            RoundedBitmapDrawable d = RoundedBitmapDrawableFactory.create(a.getResources(), pic);
            d.setCornerRadius(px * 0.24f); // in the view's pixels: FIT_XY draws it to the view's size
            d.setAntiAlias(true);
            ImageView img = new ImageView(a);
            img.setImageDrawable(d);
            img.setScaleType(ImageView.ScaleType.FIT_XY);
            img.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO); // the tile says "Open …"
            img.setLayoutParams(new LinearLayout.LayoutParams(px, px));
            return img;
        }
        if (icon.isEmpty() && "app".equals(kind)) {
            try {
                Drawable d = a.getPackageManager().getApplicationIcon(s.optString("target"));
                ImageView img = new ImageView(a);
                img.setImageDrawable(d);
                img.setLayoutParams(new LinearLayout.LayoutParams(dp(a, size), dp(a, size)));
                return img;
            } catch (Exception ignored) {
                // gone from the phone: the default mark instead
            }
        }
        TextView m = new TextView(a);
        m.setText(icon.isEmpty() ? ("file".equals(kind) ? "📄" : "app".equals(kind) ? "▦" : "🔗") : icon);
        m.setTextSize(TypedValue.COMPLEX_UNIT_SP, size * 0.8f);
        m.setTextColor(Color.WHITE);
        m.setIncludeFontPadding(false);
        m.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return m;
    }

    // ------------------------------------------------------------ the bento box

    static final int COLS = 4;

    /**
     * Where each of n tiles goes in the bento box, four cells across: { column, row, width, height }. One
     * fills the row and two share it; from three on, the first is big (two by two) and the rest fill in
     * beside it, then rows of four small ones, and a last row that never ends in a gap. The editor's preview
     * lays them out the same way (app.js, bentoTiles).
     */
    static int[][] bento(int n) {
        final int[] S = { 1, 1 }, W = { 2, 1 }, B = { 2, 2 }, F = { 4, 1 };
        List<int[]> sizes = new ArrayList<>();
        if (n == 1) sizes.add(F);
        else if (n == 2) { sizes.add(W); sizes.add(W); }
        else if (n == 3) { sizes.add(B); sizes.add(W); sizes.add(W); }
        else if (n == 4) { sizes.add(B); sizes.add(W); sizes.add(S); sizes.add(S); }
        else if (n >= 5) {
            sizes.add(B);
            int rest = n - 1;
            for (; rest >= 4; rest -= 4) for (int i = 0; i < 4; i++) sizes.add(S);
            if (rest == 1) sizes.add(F);
            else if (rest == 2) { sizes.add(W); sizes.add(W); }
            else if (rest == 3) { sizes.add(W); sizes.add(S); sizes.add(S); }
        }
        // Each in the first place it fits, row by row.
        int[][] out = new int[sizes.size()][];
        List<boolean[]> taken = new ArrayList<>();
        for (int i = 0; i < sizes.size(); i++) {
            int w = sizes.get(i)[0], h = sizes.get(i)[1];
            place:
            for (int r = 0; ; r++) {
                for (int c = 0; c + w <= COLS; c++) {
                    if (!free(taken, c, r, w, h)) continue;
                    for (int y = r; y < r + h; y++) for (int x = c; x < c + w; x++) line(taken, y)[x] = true;
                    out[i] = new int[] { c, r, w, h };
                    break place;
                }
            }
        }
        return out;
    }

    private static boolean free(List<boolean[]> taken, int c, int r, int w, int h) {
        for (int y = r; y < r + h; y++) for (int x = c; x < c + w; x++) if (y < taken.size() && taken.get(y)[x]) return false;
        return true;
    }

    private static boolean[] line(List<boolean[]> taken, int y) {
        while (taken.size() <= y) taken.add(new boolean[COLS]);
        return taken.get(y);
    }

    /** The shortcuts as tiles: the first big, the rest round it (bento()). */
    private static View tiles(Activity a, JSONArray list, Consumer<JSONObject> open) {
        List<JSONObject> items = new ArrayList<>();
        for (int i = 0; i < list.length(); i++) if (list.optJSONObject(i) != null) items.add(list.optJSONObject(i));
        int[][] spots = bento(items.size());
        Bento box = new Bento(a, spots);
        box.setVisibility(items.isEmpty() ? View.GONE : View.VISIBLE);
        for (int i = 0; i < items.size(); i++) box.addView(tile(a, items.get(i), spots[i], open));
        return box;
    }

    /**
     * One tile, on the panel's own dark: a small one has its icon over the name, a wide one beside it, and
     * the big one a large icon at the top, with what it opens and its name at the foot.
     */
    private static View tile(Activity a, JSONObject s, int[] spot, Consumer<JSONObject> open) {
        boolean small = spot[2] == 1, big = spot[3] == 2;
        LinearLayout t = new LinearLayout(a);
        t.setOrientation(small || big ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        t.setGravity(small ? Gravity.CENTER : big ? Gravity.START : Gravity.CENTER_VERTICAL);
        int pad = dp(a, small ? 8 : big ? 16 : 14);
        t.setPadding(pad, pad, pad, pad);
        float radius = dp(a, big ? 26 : 20);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(OnyxPanel.CARD);
        bg.setStroke(Math.max(1, dp(a, 0.7f)), 0x1FFFFFFF);
        bg.setCornerRadius(radius);
        t.setBackground(bg);
        GradientDrawable mask = new GradientDrawable();
        mask.setColor(Color.WHITE);
        mask.setCornerRadius(radius);
        t.setForeground(new RippleDrawable(ColorStateList.valueOf(0x40FFFFFF), null, mask));

        t.addView(mark(a, s, small ? 28 : big ? 44 : 30));
        TextView label = new TextView(a);
        label.setText(labelOf(s));
        label.setTextColor(OnyxPanel.TEXT);
        label.setEllipsize(TextUtils.TruncateAt.END);
        Typeface medium = Typeface.create("sans-serif-medium", Typeface.NORMAL);
        if (small) {
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
            label.setSingleLine(true);
            label.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(a, 6);
            t.addView(label, lp);
        } else if (big) {
            t.addView(new View(a), new LinearLayout.LayoutParams(1, 0, 1)); // the words sit at the foot
            TextView kind = new TextView(a);
            kind.setText(kindOf(s));
            kind.setTextColor(OnyxPanel.MUTED);
            kind.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            kind.setTypeface(medium);
            kind.setLetterSpacing(0.12f);
            kind.setSingleLine(true);
            kind.setEllipsize(TextUtils.TruncateAt.END);
            t.addView(kind);
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
            label.setTypeface(medium);
            label.setMaxLines(2);
            t.addView(label);
        } else {
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            label.setTypeface(medium);
            label.setMaxLines(2);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            lp.leftMargin = dp(a, 12);
            t.addView(label, lp);
        }
        t.setContentDescription("Open " + labelOf(s));
        t.setOnClickListener(v -> open.accept(s));
        return t;
    }

    /** The big tile's line over the name: what it opens (APP, AUDIO, FILE, or the link's site or app). */
    static String kindOf(JSONObject s) {
        switch (s.optString("kind")) {
            case "app": return "APP";
            case "file": return LockAudio.isAudio(s) ? "AUDIO" : "FILE";
            default: {
                String t = s.optString("target");
                Uri u = Uri.parse(t.matches("^[a-zA-Z][a-zA-Z0-9+.-]*:.*") ? t : "https://" + t);
                String host = u.getHost();
                if (host != null && !host.isEmpty()) return host.replaceFirst("^www\\.", "").toUpperCase(Locale.ROOT);
                String scheme = u.getScheme();
                return scheme == null || scheme.isEmpty() ? "LINK" : scheme.toUpperCase(Locale.ROOT);
            }
        }
    }

    /** Lays its tiles on the grid bento() gives: square cells as wide as fit (at most 96dp), 10dp apart. */
    private static final class Bento extends ViewGroup {
        private final int[][] spots;
        private final int gap, most;
        private int cell;

        Bento(Context c, int[][] spots) {
            super(c);
            this.spots = spots;
            gap = dp(c, 10);
            most = dp(c, 96);
        }

        private int span(int n) {
            return n * cell + (n - 1) * gap;
        }

        @Override
        protected void onMeasure(int widthSpec, int heightSpec) {
            int room = MeasureSpec.getMode(widthSpec) == MeasureSpec.UNSPECIFIED ? COLS * most + (COLS - 1) * gap : MeasureSpec.getSize(widthSpec);
            cell = Math.max(0, Math.min(most, (room - (COLS - 1) * gap) / COLS));
            int rows = 0;
            for (int i = 0; i < getChildCount() && i < spots.length; i++) {
                int[] p = spots[i];
                rows = Math.max(rows, p[1] + p[3]);
                getChildAt(i).measure(MeasureSpec.makeMeasureSpec(span(p[2]), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(span(p[3]), MeasureSpec.EXACTLY));
            }
            setMeasuredDimension(span(COLS), rows == 0 ? 0 : span(rows));
        }

        @Override
        protected void onLayout(boolean changed, int l, int t, int r, int b) {
            for (int i = 0; i < getChildCount() && i < spots.length; i++) {
                View v = getChildAt(i);
                int x = spots[i][0] * (cell + gap), y = spots[i][1] * (cell + gap);
                v.layout(x, y, x + v.getMeasuredWidth(), y + v.getMeasuredHeight());
            }
        }
    }

    static String labelOf(JSONObject s) {
        String l = s.optString("label");
        if (!l.isEmpty()) return l;
        String n = s.optString("name");
        if (!n.isEmpty()) return n;
        return s.optString("target");
    }
}
