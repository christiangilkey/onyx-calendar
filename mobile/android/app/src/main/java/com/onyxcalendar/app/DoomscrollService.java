package com.onyxcalendar.app;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The doomscroll saver. With it on (Settings → Doomscroll saver) and allowed in Android's
 * Accessibility settings, it notices which app is in front and, in a browser, which site: the
 * site's name in the address bar, nothing else on the screen. After a stretch on social media
 * (5 minutes unless changed), a small card comes up in the bottom right corner: how long it has
 * been, and the next thing on your calendar with a bar filling as it nears. A tap brings Onyx
 * back; the × hides it for another stretch of the same length.
 *
 * Nothing it sees is kept or sent. It holds, in memory, only the app or site in front and when
 * the current stretch began; the card is drawn here, as an accessibility overlay.
 */
public class DoomscrollService extends AccessibilityService {
    static final String PREFS = "onyx_doomscroll";
    static final int DEFAULT_MINUTES = 5;
    private static final long TICK = 5_000;       // a look at what is in front, every five seconds
    private static final long GAP = 60_000;       // away from social media this long ends the stretch
    private static final long MIN = 60_000;

    /** The apps that count, by package, with the name the card shows. */
    static final Map<String, String> APPS = new HashMap<>();
    /** The sites that count, by address (no www. or m.), with the name the card shows. */
    static final Map<String, String> SITES = new HashMap<>();
    /** Browsers, and the ids their address bars go by. */
    static final Map<String, String[]> BROWSERS = new HashMap<>();
    static {
        String[][] apps = {
            { "com.instagram.android", "Instagram" }, { "com.instagram.barcelona", "Threads" },
            { "com.zhiliaoapp.musically", "TikTok" }, { "com.ss.android.ugc.trill", "TikTok" }, { "com.zhiliaoapp.musically.go", "TikTok" },
            { "com.facebook.katana", "Facebook" }, { "com.facebook.lite", "Facebook" },
            { "com.twitter.android", "X" }, { "com.snapchat.android", "Snapchat" }, { "com.reddit.frontpage", "Reddit" },
            { "com.google.android.youtube", "YouTube" }, { "com.pinterest", "Pinterest" }, { "com.tumblr", "Tumblr" },
            { "xyz.blueskyweb.app", "Bluesky" }, { "tv.twitch.android.app", "Twitch" }, { "com.linkedin.android", "LinkedIn" },
            { "com.vkontakte.android", "VK" }, { "com.lemon.lvoverseas", "CapCut" }, { "com.bereal.ft", "BeReal" },
        };
        for (String[] a : apps) APPS.put(a[0], a[1]);
        String[][] sites = {
            { "instagram.com", "Instagram" }, { "threads.net", "Threads" }, { "threads.com", "Threads" }, { "tiktok.com", "TikTok" },
            { "facebook.com", "Facebook" }, { "fb.com", "Facebook" }, { "x.com", "X" }, { "twitter.com", "X" },
            { "snapchat.com", "Snapchat" }, { "reddit.com", "Reddit" }, { "youtube.com", "YouTube" }, { "youtu.be", "YouTube" },
            { "pinterest.com", "Pinterest" }, { "tumblr.com", "Tumblr" }, { "bsky.app", "Bluesky" }, { "twitch.tv", "Twitch" },
            { "linkedin.com", "LinkedIn" }, { "9gag.com", "9GAG" }, { "vk.com", "VK" },
        };
        for (String[] s : sites) SITES.put(s[0], s[1]);
        BROWSERS.put("com.android.chrome", new String[] { "url_bar" });
        BROWSERS.put("com.chrome.beta", new String[] { "url_bar" });
        BROWSERS.put("com.brave.browser", new String[] { "url_bar" });
        BROWSERS.put("com.microsoft.emmx", new String[] { "url_bar" });
        BROWSERS.put("com.vivaldi.browser", new String[] { "url_bar" });
        BROWSERS.put("com.sec.android.app.sbrowser", new String[] { "location_bar_edit_text", "url_bar" });
        BROWSERS.put("org.mozilla.firefox", new String[] { "mozac_browser_toolbar_url_view", "url_bar_title" });
        BROWSERS.put("org.mozilla.fenix", new String[] { "mozac_browser_toolbar_url_view" });
        BROWSERS.put("com.opera.browser", new String[] { "url_field" });
        BROWSERS.put("com.duckduckgo.mobile.android", new String[] { "omnibarTextInput" });
    }

    /** The service running now (so Settings can show a preview of the card), or null. */
    static DoomscrollService live;

    // ---- the settings (Settings → Doomscroll saver), kept on the phone

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean on(Context ctx) {
        return prefs(ctx).getBoolean("on", false);
    }

    static int minutes(Context ctx) {
        return Math.max(1, Math.min(120, prefs(ctx).getInt("minutes", DEFAULT_MINUTES)));
    }

    static void set(Context ctx, Boolean on, Integer minutes) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (on != null) e.putBoolean("on", on);
        if (minutes != null) e.putInt("minutes", Math.max(1, Math.min(120, minutes)));
        e.apply();
        if (live != null) live.handler.post(live::tick);
    }

    /** Whether Android's Accessibility switch for it is on. */
    static boolean allowed(Context ctx) {
        String list = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (list == null) return false;
        ComponentName me = new ComponentName(ctx, DoomscrollService.class);
        for (String s : list.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(s);
            if (me.equals(c)) return true;
        }
        return false;
    }

    // ---- what is in front, and the stretch on social media

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private String frontPkg = "";          // the app in front
    private String frontSite = null;       // in a browser: the social site it shows (null: none)
    private long stretchStart = 0, lastSocial = 0, hiddenUntil = 0, previewUntil = 0, lastFetch = 0;
    private final LinkedHashSet<String> names = new LinkedHashSet<>(); // what this stretch has been on
    private String iconPkg = "", shownIcon = null;
    private View card;
    private TextView title, sub, nextLabel, nextWhen, nextTitle, nextLeft;
    private ImageView icon;
    private View nextBox, barFill;
    private FrameLayout bar;

    @Override
    protected void onServiceConnected() {
        live = this;
        handler.removeCallbacksAndMessages(null);
        handler.post(this::tick);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        // Only window changes come here (res/xml/doomscroll_service.xml): a look straight away, so a
        // switch of app is seen at once rather than at the next tick.
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        if (passing(pkg)) return;
        if (!pkg.equals(frontPkg)) { frontPkg = pkg; frontSite = null; }
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        if (live == this) live = null;
        handler.removeCallbacksAndMessages(null);
        hideCard();
        bg.shutdownNow();
        super.onDestroy();
    }

    /** Windows that pass over an app without replacing it: this card, the notification shade. */
    private boolean passing(String pkg) {
        return pkg.equals(getPackageName()) || pkg.equals("com.android.systemui");
    }

    /** The social app or site in front now (its name), or null. Reads the active window only. */
    private String social() {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null && root.getPackageName() != null) {
                String pkg = root.getPackageName().toString();
                if (!passing(pkg)) {
                    if (!pkg.equals(frontPkg)) { frontPkg = pkg; frontSite = null; }
                    String[] ids = BROWSERS.get(pkg);
                    if (ids != null) {
                        String url = addressBar(root, pkg, ids);
                        // The address bar slides away while you scroll: the site stays as last read.
                        if (url != null) frontSite = siteName(url);
                    }
                }
            }
        } catch (Exception ignored) {
            // a window going away mid-look: the next tick looks again
        }
        String app = APPS.get(frontPkg);
        if (app != null) return app;
        return BROWSERS.containsKey(frontPkg) ? frontSite : null;
    }

    private static String addressBar(AccessibilityNodeInfo root, String pkg, String[] ids) {
        for (String id : ids) {
            List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByViewId(pkg + ":id/" + id);
            if (found == null) continue;
            for (AccessibilityNodeInfo n : found) {
                CharSequence t = n.getText();
                if (t != null && t.length() > 0) return t.toString();
            }
        }
        return null;
    }

    /** The social site an address is on ("m.instagram.com/reels" → Instagram), or null. */
    static String siteName(String url) {
        String s = url.trim().toLowerCase();
        int scheme = s.indexOf("://");
        if (scheme >= 0) s = s.substring(scheme + 3);
        int end = 0;
        while (end < s.length() && "/?#: ".indexOf(s.charAt(end)) < 0) end++;
        String host = s.substring(0, end);
        if (host.indexOf('.') < 0) return null; // a search being typed, not an address
        for (Map.Entry<String, String> e : SITES.entrySet()) {
            String site = e.getKey();
            if (host.equals(site) || host.endsWith("." + site)) return e.getValue();
        }
        return null;
    }

    private void tick() {
        handler.removeCallbacksAndMessages(null);
        long now = System.currentTimeMillis();
        PowerManager pm = getSystemService(PowerManager.class);
        boolean screenOn = pm == null || pm.isInteractive();
        String name = on(this) && screenOn ? social() : null;
        if (name != null) {
            if (stretchStart == 0 || now - lastSocial > GAP) { stretchStart = now; names.clear(); hiddenUntil = 0; }
            lastSocial = now;
            names.remove(name);
            names.add(name); // the one in front last
            iconPkg = frontPkg;
            if (now - stretchStart >= minutes(this) * MIN && now >= hiddenUntil) showCard(now);
            else if (now >= previewUntil) hideCard();
        } else {
            if (now >= previewUntil) hideCard();
            if (stretchStart != 0 && now - lastSocial > GAP) { stretchStart = 0; names.clear(); }
        }
        if (card != null) drawCard(now);
        handler.postDelayed(this::tick, card != null ? 1_000 : TICK);
    }

    /** Settings → Doomscroll saver → Show me: the card for ten seconds, as it would look now. */
    static boolean preview() {
        DoomscrollService s = live;
        if (s == null) return false;
        s.handler.post(() -> {
            s.previewUntil = System.currentTimeMillis() + 10_000;
            s.showCard(System.currentTimeMillis());
            s.drawCard(System.currentTimeMillis());
            s.handler.postDelayed(s::tick, 1_000);
        });
        return true;
    }

    // ---- the card

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    private void showCard(long now) {
        if (card != null) return;
        shownIcon = null;
        WindowManager wm = getSystemService(WindowManager.class);
        if (wm == null) return;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(14), dp(12), dp(10), dp(13));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xF516161B);
        bg.setCornerRadius(dp(20));
        bg.setStroke(dp(1), 0x26FFFFFF);
        box.setBackground(bg);
        box.setElevation(dp(10));

        // How long: the app's icon, "12 min on Instagram", and the way back.
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        icon = new ImageView(this);
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(30), dp(30));
        ip.setMarginEnd(dp(10));
        head.addView(icon, ip);
        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        title = text(15, Color.WHITE, true);
        sub = text(12, 0xFF9AA0A8, false);
        sub.setText("Tap to get back to Onyx");
        words.addView(title);
        words.addView(sub);
        head.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView close = text(18, 0xFF7B808A, false);
        close.setText("×");
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("Hide for now");
        close.setOnClickListener(v -> {
            hiddenUntil = System.currentTimeMillis() + minutes(this) * MIN;
            previewUntil = 0;
            hideCard();
        });
        head.addView(close, new LinearLayout.LayoutParams(dp(34), dp(34)));
        box.addView(head);

        // What's next: a line, then the bar filling as it nears.
        LinearLayout next = new LinearLayout(this);
        next.setOrientation(LinearLayout.VERTICAL);
        next.setPadding(0, dp(10), dp(4), 0);
        View rule = new View(this);
        rule.setBackgroundColor(0x1AFFFFFF);
        next.addView(rule, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(0, dp(9), 0, dp(2));
        nextLabel = text(10, 0xFF5FD38D, true);
        nextLabel.setLetterSpacing(0.12f);
        nextWhen = text(11.5f, 0xFF9AA0A8, false);
        nextWhen.setPadding(dp(6), 0, 0, 0);
        nextLeft = text(12, 0xFF5FD38D, true);
        top.addView(nextLabel);
        top.addView(nextWhen, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        top.addView(nextLeft);
        next.addView(top);
        nextTitle = text(13.5f, 0xFFE8E9EE, true);
        next.addView(nextTitle);
        bar = new FrameLayout(this);
        GradientDrawable track = new GradientDrawable();
        track.setColor(0x1FFFFFFF);
        track.setCornerRadius(dp(3));
        bar.setBackground(track);
        barFill = new View(this);
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(0xFF5FD38D);
        fill.setCornerRadius(dp(3));
        barFill.setBackground(fill);
        bar.addView(barFill, new FrameLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(5));
        bp.topMargin = dp(8);
        next.addView(bar, bp);
        nextBox = next;
        box.addView(next);

        box.setOnClickListener(v -> openOnyx());
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(dp(286), ViewGroup.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.END;
        lp.x = dp(12);
        lp.y = dp(84); // above an app's own tab bar and Android's navigation
        lp.windowAnimations = android.R.style.Animation_Toast;
        try {
            wm.addView(box, lp);
            card = box;
        } catch (Exception ignored) {
            card = null; // not allowed just now: the next tick tries again
        }
    }

    private void hideCard() {
        if (card == null) return;
        try {
            WindowManager wm = getSystemService(WindowManager.class);
            if (wm != null) wm.removeView(card);
        } catch (Exception ignored) {
            // already gone
        }
        card = null;
    }

    private void openOnyx() {
        hideCard();
        previewUntil = 0;
        hiddenUntil = System.currentTimeMillis() + MIN; // not straight back if you return to the app for a moment
        Intent i = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(i);
        } catch (Exception ignored) {
            // Onyx can't be brought up from here just now
        }
    }

    /** "5 min", "1 h 5 min". */
    static String span(long ms) {
        long m = Math.max(1, Math.round(ms / (double) MIN));
        return m < 60 ? m + " min" : (m / 60) + " h" + (m % 60 > 0 ? " " + (m % 60) + " min" : "");
    }

    /** The names on the card: "Instagram", or "TikTok and Instagram" for a stretch across two. */
    private String onWhat() {
        List<String> list = new ArrayList<>(names);
        if (list.isEmpty()) return "social media";
        if (list.size() == 1) return list.get(0);
        String last = list.get(list.size() - 1), before = list.get(list.size() - 2);
        return list.size() == 2 ? before + " and " + last : before + ", " + last + " and more";
    }

    private void drawCard(long now) {
        if (card == null) return;
        long since = stretchStart > 0 ? now - stretchStart : minutes(this) * MIN;
        title.setText(span(since) + " on " + onWhat());
        if (!iconPkg.equals(shownIcon)) {
            shownIcon = iconPkg;
            try {
                Drawable d = iconPkg.isEmpty() ? null : getPackageManager().getApplicationIcon(iconPkg);
                icon.setImageDrawable(d != null ? d : getPackageManager().getApplicationIcon(getPackageName()));
            } catch (PackageManager.NameNotFoundException e) {
                icon.setImageDrawable(null);
            }
        }
        // The next thing, from what Onyx last fetched from the PC (fetched again when it is old).
        if (now - LauncherData.updated(this) > 10 * MIN && now - lastFetch > 2 * MIN) {
            lastFetch = now;
            bg.execute(() -> {
                LauncherData.fetch(this);
                handler.post(() -> drawCard(System.currentTimeMillis()));
            });
        }
        List<LauncherData.Item> items = LauncherData.items(this);
        LauncherData.Item next = LauncherData.next(items, now);
        LauncherData.Item today = null;
        if (next == null) {
            for (LauncherData.Item it : items) {
                if (it.allDay && !it.done && "task".equals(it.kind) && LauncherData.dayOf(it.start).equals(LauncherData.dayOf(now))) { today = it; break; }
            }
        }
        if (next == null && today == null) {
            nextLabel.setText("NEXT");
            nextLabel.setTextColor(0xFF7B808A);
            nextWhen.setText("");
            nextLeft.setText("");
            nextTitle.setText("Nothing else on your calendar today");
            nextTitle.setTextColor(0xFF9AA0A8);
            bar.setVisibility(View.GONE);
            return;
        }
        nextTitle.setTextColor(0xFFE8E9EE);
        if (next == null) {
            nextLabel.setText("DUE TODAY");
            nextLabel.setTextColor(0xFFF5B83D);
            nextWhen.setText("");
            nextLeft.setText("");
            nextTitle.setText(today.title);
            bar.setVisibility(View.GONE);
            return;
        }
        long left = next.start - now;
        // Calm with over half an hour, amber within it, red within ten minutes (as the app's Next bar).
        int tone = left <= 10 * MIN ? 0xFFFF5B5B : left <= 30 * MIN ? 0xFFF5B83D : 0xFF5FD38D;
        nextLabel.setText("task".equals(next.kind) ? "NEXT TASK" : "NEXT");
        nextLabel.setTextColor(tone);
        nextWhen.setText("· " + DateFormat.getTimeFormat(this).format(new Date(next.start))
            + (LauncherData.dayOf(next.start).equals(LauncherData.dayOf(now)) ? "" : " tomorrow"));
        nextLeft.setText("in " + span(left));
        nextLeft.setTextColor(tone);
        nextTitle.setText(next.title);
        bar.setVisibility(View.VISIBLE);
        ((GradientDrawable) barFill.getBackground()).setColor(tone);
        // The bar fills over the last two hours before it.
        float p = Math.max(0.04f, Math.min(1f, 1f - left / (float) (120 * MIN)));
        bar.post(() -> {
            ViewGroup.LayoutParams l = barFill.getLayoutParams();
            l.width = Math.round(bar.getWidth() * p);
            barFill.setLayoutParams(l);
        });
    }
}
