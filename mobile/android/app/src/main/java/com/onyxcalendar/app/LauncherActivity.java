package com.onyxcalendar.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityOptions;
import android.app.AlertDialog;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.LauncherActivityInfo;
import android.content.pm.LauncherApps;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ShortcutInfo;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.UserHandle;
import android.os.UserManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Onyx Home: a plain home screen with Onyx on it. The clock, then (when Onyx shows on the
 * home screen) what is on now and next, the Pi's calls, goals and today; widgets; the apps
 * pinned to the home screen; and a dock. Swipe up (or tap the handle) for every app, with
 * search; swipe down for notifications; hold an app for its shortcuts and options, or an
 * empty spot for the home screen's own (wallpaper, widgets, where Onyx shows).
 */
public class LauncherActivity extends Activity implements OnyxPanel.Host {
    private static final int HOST_ID = 7071;
    private static final int REQ_BIND = 4201, REQ_CONFIG = 4202;
    private static final int DOCK_MAX = 5, COLUMNS = 4;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private LauncherApps launcherApps;
    private UserManager users;
    private AppWidgetHost widgetHost;
    private AppWidgetManager widgetManager;
    private SharedPreferences prefs;

    private final List<App> apps = new ArrayList<>();
    private final Map<String, App> byKey = new HashMap<>();

    private ScrollView scroll;
    private LinearLayout content, panelBox, widgetsBox, homeGrid, dock, dockBar;
    private FrameLayout drawer;
    private EditText search;
    private GridView drawerGrid;
    private final AppAdapter drawerAdapter = new AppAdapter();
    private OnyxPanel panel;
    private int pendingWidget = -1;
    private boolean resumed;
    private long lastFetch;

    static final class App {
        final ComponentName component;
        final UserHandle user;
        final String label, key;
        final Drawable icon;
        final boolean system;

        App(ComponentName component, UserHandle user, String label, Drawable icon, String key, boolean system) {
            this.component = component;
            this.user = user;
            this.label = label;
            this.icon = icon;
            this.key = key;
            this.system = system;
        }
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    // ------------------------------------------------------------ setting up

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = LauncherData.prefs(this);
        launcherApps = getSystemService(LauncherApps.class);
        users = getSystemService(UserManager.class);
        widgetManager = AppWidgetManager.getInstance(this);
        widgetHost = new AppWidgetHost(getApplicationContext(), HOST_ID);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        setContentView(build());

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }
        launcherApps.registerCallback(appsChanged, ui);
        loadApps();
        restoreWidgets();
        OnyxLiveService.sync(this);
    }

    @Override
    protected void onDestroy() {
        launcherApps.unregisterCallback(appsChanged);
        bg.shutdownNow();
        super.onDestroy();
    }

    @Override
    protected void onStart() {
        super.onStart();
        try {
            widgetHost.startListening();
        } catch (Exception ignored) {
            // a widget provider that went away
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        try {
            widgetHost.stopListening();
        } catch (Exception ignored) {
            // nothing to stop
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        showPanel();
        if (System.currentTimeMillis() - lastFetch > 60_000) fetch();
        ui.removeCallbacks(ticker);
        ui.post(ticker);
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        ui.removeCallbacks(ticker);
    }

    /** The Home button on the home screen: back to the top, drawer closed. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (drawer.getVisibility() == View.VISIBLE) closeDrawer();
        else if (scroll != null) scroll.smoothScrollTo(0, 0);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        back();
    }

    private void back() {
        if (drawer.getVisibility() == View.VISIBLE) closeDrawer();
        else if (scroll != null) scroll.smoothScrollTo(0, 0);
    }

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!resumed) return;
            if (panel != null && LauncherData.onHome(LauncherActivity.this) && panel.tick()) panel.render();
            if (System.currentTimeMillis() - lastFetch > 5 * 60_000) fetch();
            ui.postDelayed(this, 1000 - System.currentTimeMillis() % 1000);
        }
    };

    private void fetch() {
        lastFetch = System.currentTimeMillis();
        bg.execute(() -> {
            LauncherData.fetch(this);
            ui.post(this::showPanel);
        });
    }

    // ------------------------------------------------------------ the layout

    private View build() {
        GestureFrame root = new GestureFrame(this);

        LinearLayout home = new LinearLayout(this);
        home.setOrientation(LinearLayout.VERTICAL);
        root.addView(home, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setClipToPadding(false);
        home.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(24), dp(16), dp(16));
        content.setLongClickable(true);
        content.setOnLongClickListener(v -> { homeMenu(); return true; });
        scroll.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextClock clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setFormat24Hour("H:mm");
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 64);
        clock.setTextColor(Color.WHITE);
        clock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        clock.setShadowLayer(dp(6), 0, 0, 0x66000000);
        clock.setOnClickListener(v -> openClock());
        content.addView(clock);

        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, MMMM d");
        date.setFormat24Hour("EEEE, MMMM d");
        date.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        date.setTextColor(0xEEFFFFFF);
        date.setShadowLayer(dp(4), 0, 0, 0x66000000);
        date.setPadding(dp(2), 0, 0, dp(18));
        date.setOnClickListener(v -> openOnyx(null));
        content.addView(date);

        panelBox = new LinearLayout(this);
        panelBox.setOrientation(LinearLayout.VERTICAL);
        content.addView(panelBox);
        panel = new OnyxPanel(this, this, false);
        panelBox.addView(panel.root);

        widgetsBox = new LinearLayout(this);
        widgetsBox.setOrientation(LinearLayout.VERTICAL);
        content.addView(widgetsBox);

        homeGrid = new LinearLayout(this);
        homeGrid.setOrientation(LinearLayout.VERTICAL);
        homeGrid.setPadding(0, dp(8), 0, 0);
        content.addView(homeGrid);

        // The handle for the app drawer, then the dock.
        dockBar = new LinearLayout(this);
        dockBar.setOrientation(LinearLayout.VERTICAL);
        home.addView(dockBar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView handle = new TextView(this);
        handle.setText("︿");
        handle.setTextColor(0xCCFFFFFF);
        handle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        handle.setGravity(Gravity.CENTER);
        handle.setPadding(0, dp(2), 0, 0);
        handle.setContentDescription("All apps");
        handle.setOnClickListener(v -> openDrawer());
        dockBar.addView(handle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(26)));
        dock = new LinearLayout(this);
        dock.setOrientation(LinearLayout.HORIZONTAL);
        dock.setGravity(Gravity.CENTER);
        GradientDrawable dockBg = new GradientDrawable();
        dockBg.setColor(0x4D000000);
        dockBg.setCornerRadius(dp(28));
        dock.setBackground(dockBg);
        dock.setPadding(dp(6), dp(8), dp(6), dp(8));
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dl.leftMargin = dl.rightMargin = dp(12);
        dockBar.addView(dock, dl);

        root.addView(buildDrawer(), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            content.setPadding(dp(16) + bars.left, bars.top + dp(24), dp(16) + bars.right, dp(16));
            dockBar.setPadding(bars.left, 0, bars.right, bars.bottom + dp(8));
            drawer.setPadding(bars.left, bars.top + dp(12), bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        return root;
    }

    private View buildDrawer() {
        drawer = new GestureFrame(this);
        drawer.setBackgroundColor(0xF20B0C10);
        drawer.setVisibility(View.GONE);
        drawer.setClickable(true); // taps don't fall through to the home screen

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        drawer.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        search = new EditText(this);
        search.setHint("Search apps");
        search.setHintTextColor(0x99FFFFFF);
        search.setTextColor(Color.WHITE);
        search.setSingleLine(true);
        search.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        search.setImeOptions(EditorInfo.IME_ACTION_GO);
        search.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable sbg = new GradientDrawable();
        sbg.setColor(0x26FFFFFF);
        sbg.setCornerRadius(dp(24));
        search.setBackground(sbg);
        search.setPadding(dp(18), dp(12), dp(18), dp(12));
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { drawerAdapter.filter(s.toString()); }
        });
        search.setOnEditorActionListener((v, action, event) -> {
            boolean go = action == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER);
            if (go && drawerAdapter.getCount() > 0) {
                launch(drawerAdapter.getItem(0), v);
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sl.leftMargin = sl.rightMargin = dp(16);
        sl.bottomMargin = dp(8);
        box.addView(search, sl);

        drawerGrid = new GridView(this);
        drawerGrid.setNumColumns(COLUMNS);
        drawerGrid.setVerticalSpacing(dp(10));
        drawerGrid.setPadding(dp(8), dp(4), dp(8), dp(16));
        drawerGrid.setClipToPadding(false);
        drawerGrid.setSelector(new GradientDrawable());
        drawerGrid.setAdapter(drawerAdapter);
        drawerGrid.setOnItemClickListener((parent, view, pos, id) -> launch(drawerAdapter.getItem(pos), view));
        drawerGrid.setOnItemLongClickListener((parent, view, pos, id) -> { appMenu(drawerAdapter.getItem(pos), view, null); return true; });
        box.addView(drawerGrid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return drawer;
    }

    /** A frame that takes the touches nothing in it wants, so a swipe on an empty spot is still seen. */
    private static final class GestureFrame extends FrameLayout {
        GestureFrame(Context ctx) {
            super(ctx);
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouchEvent(MotionEvent ev) {
            super.onTouchEvent(ev);
            return true;
        }
    }

    /**
     * Swipe up for the apps, down for notifications; in the drawer, down to close it. Watched
     * here, for the whole screen, because a scrolling list keeps its touches from its parents.
     */
    private GestureDetector swipes;
    private boolean swipeInDrawer;

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (swipes == null) {
            swipes = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                    if (e1 == null || Math.abs(vy) < Math.abs(vx) * 1.4f || Math.abs(vy) < dp(500)) return false;
                    if (swipeInDrawer) {
                        if (vy > 0 && !drawerGrid.canScrollVertically(-1)) { closeDrawer(); return true; }
                        return false;
                    }
                    if (drawer.getVisibility() == View.VISIBLE) return false;
                    // From the dock up always opens the apps; elsewhere once the home screen is scrolled to its end.
                    int[] at = new int[2];
                    dockBar.getLocationOnScreen(at);
                    boolean fromDock = e1.getRawY() >= at[1] - dp(48);
                    if (vy < 0 && (fromDock || !scroll.canScrollVertically(1))) { openDrawer(); return true; }
                    if (vy > 0 && !fromDock && !scroll.canScrollVertically(-1)) { expandNotifications(); return true; }
                    return false;
                }
            });
        }
        if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) swipeInDrawer = drawer.getVisibility() == View.VISIBLE;
        swipes.onTouchEvent(ev);
        return super.dispatchTouchEvent(ev);
    }

    // ------------------------------------------------------------ the Onyx panel

    private void showPanel() {
        boolean on = LauncherData.onHome(this);
        panelBox.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on) panel.render();
    }

    @Override
    public void openOnyx(String day) {
        String url = "onyx://open?view=calendar" + (day != null ? "&date=" + day : "") + "&n=" + System.currentTimeMillis();
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open Onyx", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void acknowledge(LauncherData.Item item) {
        bg.execute(() -> {
            String error = null;
            try {
                LauncherData.acknowledge(this, item);
            } catch (Exception e) {
                error = e.getMessage();
            }
            LauncherData.fetch(this);
            String shown = error;
            ui.post(() -> {
                if (shown != null) Toast.makeText(this, shown, Toast.LENGTH_LONG).show();
                showPanel();
                OnyxLiveService.poke(this);
            });
        });
    }

    // ------------------------------------------------------------ apps

    private final LauncherApps.Callback appsChanged = new LauncherApps.Callback() {
        @Override public void onPackageRemoved(String pkg, UserHandle user) { loadApps(); }
        @Override public void onPackageAdded(String pkg, UserHandle user) { loadApps(); }
        @Override public void onPackageChanged(String pkg, UserHandle user) { loadApps(); }
        @Override public void onPackagesAvailable(String[] pkgs, UserHandle user, boolean replacing) { loadApps(); }
        @Override public void onPackagesUnavailable(String[] pkgs, UserHandle user, boolean replacing) { loadApps(); }
    };

    private void loadApps() {
        bg.execute(() -> {
            List<App> list = new ArrayList<>();
            int density = getResources().getDisplayMetrics().densityDpi;
            for (UserHandle user : launcherApps.getProfiles()) {
                long serial = users.getSerialNumberForUser(user);
                for (LauncherActivityInfo info : launcherApps.getActivityList(null, user)) {
                    ComponentName cn = info.getComponentName();
                    ApplicationInfo ai = info.getApplicationInfo();
                    boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
                    Drawable icon;
                    try {
                        icon = info.getBadgedIcon(density);
                    } catch (Exception e) {
                        icon = getPackageManager().getDefaultActivityIcon();
                    }
                    list.add(new App(cn, user, String.valueOf(info.getLabel()), icon, cn.flattenToString() + "#" + serial, system));
                }
            }
            Collator collator = Collator.getInstance();
            list.sort((a, b) -> collator.compare(a.label, b.label));
            ui.post(() -> {
                apps.clear();
                apps.addAll(list);
                byKey.clear();
                for (App a : list) byKey.put(a.key, a);
                if (!prefs.contains("dock")) saveList("dock", defaultDock());
                drawerAdapter.filter(search.getText().toString());
                drawHomeApps();
            });
        });
    }

    /** The first dock: the phone, messages, browser and camera apps. */
    private List<String> defaultDock() {
        List<String> out = new ArrayList<>();
        Intent[] wanted = {
            new Intent(Intent.ACTION_DIAL),
            new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")),
            new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")),
            new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA),
        };
        UserHandle me = Process.myUserHandle();
        for (Intent intent : wanted) {
            ResolveInfo r = getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (r == null || r.activityInfo == null || "android".equals(r.activityInfo.packageName)) continue;
            for (App a : apps) {
                if (a.user.equals(me) && a.component.getPackageName().equals(r.activityInfo.packageName) && !out.contains(a.key)) {
                    out.add(a.key);
                    break;
                }
            }
        }
        return out;
    }

    private List<String> list(String name) {
        String s = prefs.getString(name, "");
        List<String> out = new ArrayList<>();
        for (String k : s.split("\n")) if (!k.isEmpty()) out.add(k);
        return out;
    }

    private void saveList(String name, List<String> keys) {
        prefs.edit().putString(name, TextUtils.join("\n", keys)).apply();
    }

    private View tile(App app, boolean label, String place) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setPadding(dp(2), dp(6), dp(2), dp(6));
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        t.addView(icon, new LinearLayout.LayoutParams(dp(52), dp(52)));
        if (label) {
            TextView name = new TextView(this);
            name.setText(app.label);
            name.setTextColor(Color.WHITE);
            name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            name.setGravity(Gravity.CENTER);
            name.setShadowLayer(dp(3), 0, 0, 0xAA000000);
            name.setPadding(0, dp(4), 0, 0);
            t.addView(name, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        t.setContentDescription(app.label);
        t.setOnClickListener(v -> launch(app, v));
        t.setOnLongClickListener(v -> { appMenu(app, v, place); return true; });
        return t;
    }

    private void drawHomeApps() {
        homeGrid.removeAllViews();
        List<String> keys = list("home_apps");
        LinearLayout row = null;
        int n = 0;
        for (String k : keys) {
            App a = byKey.get(k);
            if (a == null) continue;
            if (n % COLUMNS == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                homeGrid.addView(row);
            }
            row.addView(tile(a, true, "home_apps"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            n++;
        }
        if (row != null) {
            for (int i = n % COLUMNS; i != 0 && i < COLUMNS; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        }
        if (n == 0 && apps.size() > 0) {
            TextView hint = new TextView(this);
            hint.setText("Swipe up for all your apps. Hold one to put it here.");
            hint.setTextColor(0xCCFFFFFF);
            hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            hint.setGravity(Gravity.CENTER);
            hint.setShadowLayer(dp(3), 0, 0, 0xAA000000);
            hint.setPadding(0, dp(12), 0, dp(8));
            homeGrid.addView(hint);
        }

        dock.removeAllViews();
        for (String k : list("dock")) {
            App a = byKey.get(k);
            if (a != null) dock.addView(tile(a, false, "dock"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        }
        dock.setVisibility(dock.getChildCount() > 0 ? View.VISIBLE : View.GONE);
    }

    private void launch(App app, View from) {
        try {
            Rect bounds = new Rect();
            from.getGlobalVisibleRect(bounds);
            Bundle opts = ActivityOptions.makeClipRevealAnimation(from, 0, 0, from.getWidth(), from.getHeight()).toBundle();
            launcherApps.startMainActivity(app.component, app.user, bounds, opts);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open " + app.label, Toast.LENGTH_SHORT).show();
        }
        if (drawer.getVisibility() == View.VISIBLE) ui.postDelayed(this::closeDrawer, 350);
    }

    /** Holding an app: its shortcuts, then home screen, dock, app info and uninstall. */
    private void appMenu(App app, View anchor, String place) {
        PopupMenu menu = new PopupMenu(this, anchor);
        Menu m = menu.getMenu();
        List<ShortcutInfo> shortcuts = new ArrayList<>();
        try {
            if (launcherApps.hasShortcutHostPermission()) {
                LauncherApps.ShortcutQuery q = new LauncherApps.ShortcutQuery()
                    .setPackage(app.component.getPackageName())
                    .setActivity(app.component)
                    .setQueryFlags(LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC | LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST | LauncherApps.ShortcutQuery.FLAG_MATCH_PINNED);
                List<ShortcutInfo> found = launcherApps.getShortcuts(q, app.user);
                if (found != null) {
                    for (ShortcutInfo s : found) {
                        if (s.isEnabled() && shortcuts.size() < 4) shortcuts.add(s);
                    }
                }
            }
        } catch (Exception ignored) {
            // not the home app yet, or the app's shortcuts aren't readable
        }
        for (int i = 0; i < shortcuts.size(); i++) {
            CharSequence label = shortcuts.get(i).getShortLabel();
            m.add(0, 100 + i, i, label == null ? "Shortcut" : label);
        }
        List<String> home = list("home_apps"), dockKeys = list("dock");
        boolean onHome = home.contains(app.key), inDock = dockKeys.contains(app.key);
        m.add(1, 1, 10, onHome ? "Remove from home screen" : "Add to home screen");
        m.add(1, 2, 11, inDock ? "Remove from dock" : "Add to dock");
        if (place != null) {
            List<String> here = list(place);
            int at = here.indexOf(app.key);
            if (at > 0) m.add(1, 3, 12, "home_apps".equals(place) ? "Move earlier" : "Move left");
            if (at >= 0 && at < here.size() - 1) m.add(1, 4, 13, "home_apps".equals(place) ? "Move later" : "Move right");
        }
        m.add(2, 5, 20, "App info");
        if (!app.system && app.user.equals(Process.myUserHandle())) m.add(2, 6, 21, "Uninstall");
        menu.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            if (id >= 100) {
                try {
                    launcherApps.startShortcut(shortcuts.get(id - 100), null, null);
                } catch (Exception e) {
                    Toast.makeText(this, "Could not open that shortcut", Toast.LENGTH_SHORT).show();
                }
                if (drawer.getVisibility() == View.VISIBLE) closeDrawer();
                return true;
            }
            switch (id) {
                case 1:
                    if (onHome) home.remove(app.key); else home.add(app.key);
                    saveList("home_apps", home);
                    if (!onHome) Toast.makeText(this, app.label + " is on the home screen", Toast.LENGTH_SHORT).show();
                    break;
                case 2:
                    if (inDock) dockKeys.remove(app.key);
                    else if (dockKeys.size() >= DOCK_MAX) { Toast.makeText(this, "The dock holds " + DOCK_MAX + " apps. Take one off first.", Toast.LENGTH_LONG).show(); return true; }
                    else dockKeys.add(app.key);
                    saveList("dock", dockKeys);
                    break;
                case 3:
                case 4: {
                    List<String> here = list(place);
                    int at = here.indexOf(app.key), to = at + (id == 3 ? -1 : 1);
                    if (at >= 0 && to >= 0 && to < here.size()) {
                        here.set(at, here.get(to));
                        here.set(to, app.key);
                        saveList(place, here);
                    }
                    break;
                }
                case 5:
                    try {
                        launcherApps.startAppDetailsActivity(app.component, app.user, null, null);
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + app.component.getPackageName())));
                    }
                    break;
                case 6:
                    try {
                        startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + app.component.getPackageName())));
                    } catch (Exception e) {
                        Toast.makeText(this, "Could not uninstall " + app.label, Toast.LENGTH_SHORT).show();
                    }
                    break;
                default:
                    return false;
            }
            drawHomeApps();
            return true;
        });
        menu.show();
    }

    // ------------------------------------------------------------ the drawer

    private void openDrawer() {
        if (drawer.getVisibility() == View.VISIBLE) return;
        search.setText("");
        drawerGrid.setSelection(0);
        drawer.setAlpha(0f);
        drawer.setTranslationY(dp(60));
        drawer.setVisibility(View.VISIBLE);
        drawer.animate().alpha(1f).translationY(0).setDuration(180).start();
    }

    private void closeDrawer() {
        InputMethodManager imm = getSystemService(InputMethodManager.class);
        if (imm != null) imm.hideSoftInputFromWindow(search.getWindowToken(), 0);
        search.clearFocus();
        drawer.animate().alpha(0f).translationY(dp(60)).setDuration(150).withEndAction(() -> drawer.setVisibility(View.GONE)).start();
    }

    private final class AppAdapter extends BaseAdapter {
        private final List<App> shown = new ArrayList<>();

        void filter(String query) {
            String q = query == null ? "" : query.trim().toLowerCase(Locale.getDefault());
            shown.clear();
            for (App a : apps) {
                if (q.isEmpty() || a.label.toLowerCase(Locale.getDefault()).contains(q)) shown.add(a);
            }
            // Names that start with what was typed come first.
            if (!q.isEmpty()) {
                shown.sort((a, b) -> Boolean.compare(!a.label.toLowerCase(Locale.getDefault()).startsWith(q), !b.label.toLowerCase(Locale.getDefault()).startsWith(q)));
            }
            notifyDataSetChanged();
        }

        @Override public int getCount() { return shown.size(); }
        @Override public App getItem(int i) { return shown.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override
        public View getView(int i, View convert, ViewGroup parent) {
            LinearLayout t = convert instanceof LinearLayout ? (LinearLayout) convert : null;
            if (t == null) {
                t = new LinearLayout(LauncherActivity.this);
                t.setOrientation(LinearLayout.VERTICAL);
                t.setGravity(Gravity.CENTER_HORIZONTAL);
                t.setPadding(dp(2), dp(4), dp(2), dp(4));
                ImageView icon = new ImageView(LauncherActivity.this);
                t.addView(icon, new LinearLayout.LayoutParams(dp(52), dp(52)));
                TextView name = new TextView(LauncherActivity.this);
                name.setTextColor(Color.WHITE);
                name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                name.setSingleLine(true);
                name.setEllipsize(TextUtils.TruncateAt.END);
                name.setGravity(Gravity.CENTER);
                name.setPadding(0, dp(4), 0, 0);
                t.addView(name, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
            App a = shown.get(i);
            ((ImageView) t.getChildAt(0)).setImageDrawable(a.icon);
            ((TextView) t.getChildAt(1)).setText(a.label);
            t.setContentDescription(a.label);
            return t;
        }
    }

    // ------------------------------------------------------------ the home screen's own menu

    private void homeMenu() {
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        labels.add("Onyx shows on: " + LauncherData.showLabel(LauncherData.show(this)));
        actions.add(this::chooseShow);
        labels.add("Add a widget");
        actions.add(this::pickWidget);
        if (!widgetIds().isEmpty()) {
            labels.add("Remove a widget");
            actions.add(this::removeWidget);
        }
        labels.add("Wallpaper");
        actions.add(() -> {
            try {
                startActivity(Intent.createChooser(new Intent(Intent.ACTION_SET_WALLPAPER), "Wallpaper"));
            } catch (Exception e) {
                Toast.makeText(this, "No wallpaper picker on this phone", Toast.LENGTH_SHORT).show();
            }
        });
        labels.add(LauncherData.isHomeApp(this) ? "Change the home app" : "Make Onyx Home the home app");
        actions.add(() -> LauncherData.open(this, "home"));
        labels.add("Open Onyx");
        actions.add(() -> openOnyx(null));
        labels.add("Phone settings");
        actions.add(() -> LauncherData.open(this, "settings"));
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
            .show();
    }

    private void chooseShow() {
        String[] values = { LauncherData.SHOW_HOME, LauncherData.SHOW_LOCK, LauncherData.SHOW_BOTH, LauncherData.SHOW_OFF };
        String[] names = new String[values.length];
        for (int i = 0; i < values.length; i++) names[i] = LauncherData.showLabel(values[i]);
        int current = Arrays.asList(values).indexOf(LauncherData.show(this));
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Show your progress, next task and calls on")
            .setSingleChoiceItems(names, current, (d, which) -> {
                LauncherData.setShow(this, values[which]);
                d.dismiss();
                showPanel();
                if (LauncherData.onLock(this)) checkLockSwitches();
            })
            .show();
    }

    /** The lock screen needs notifications, and "display over other apps" for the full panel. */
    private void checkLockSwitches() {
        if (!LauncherData.notificationsAllowed(this)) {
            LauncherData.open(this, "notifications");
            return;
        }
        if (!LauncherData.overlayAllowed(this) || !LauncherData.fullScreenAllowed(this)) {
            new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Onyx on the lock screen")
                .setMessage("Your next task, its countdown and the Pi's calls show on the lock screen as a live notification.\n\n"
                    + "For the full Onyx panel each time the screen turns on, and calls that fill the screen, allow Onyx to "
                    + (LauncherData.overlayAllowed(this) ? "" : "display over other apps")
                    + (!LauncherData.overlayAllowed(this) && !LauncherData.fullScreenAllowed(this) ? ", and to " : "")
                    + (LauncherData.fullScreenAllowed(this) ? "" : "show full-screen alerts") + ".")
                .setPositiveButton("Allow", (d, w) -> LauncherData.open(this, !LauncherData.overlayAllowed(this) ? "overlay" : "fullscreen"))
                .setNegativeButton("Not now", null)
                .show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 4102) {
            OnyxLiveService.sync(this);
            if (LauncherData.onLock(this) && LauncherData.notificationsAllowed(this)) checkLockSwitches();
        }
    }

    private void openClock() {
        try {
            startActivity(new Intent(android.provider.AlarmClock.ACTION_SHOW_ALARMS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
            // no clock app
        }
    }

    @SuppressLint("WrongConstant")
    private void expandNotifications() {
        try {
            Object bar = getSystemService("statusbar");
            Class.forName("android.app.StatusBarManager").getMethod("expandNotificationsPanel").invoke(bar);
        } catch (Exception ignored) {
            // not allowed on this phone
        }
    }

    // ------------------------------------------------------------ widgets

    private List<Integer> widgetIds() {
        List<Integer> out = new ArrayList<>();
        for (String s : prefs.getString("widgets", "").split(",")) {
            try {
                if (!s.isEmpty()) out.add(Integer.parseInt(s));
            } catch (NumberFormatException ignored) {
                // skip it
            }
        }
        return out;
    }

    private void saveWidgetIds(List<Integer> ids) {
        prefs.edit().putString("widgets", TextUtils.join(",", ids)).apply();
    }

    private void restoreWidgets() {
        List<Integer> kept = new ArrayList<>();
        for (int id : widgetIds()) {
            AppWidgetProviderInfo info = widgetManager.getAppWidgetInfo(id);
            if (info == null) {
                widgetHost.deleteAppWidgetId(id);
                continue;
            }
            kept.add(id);
            showWidget(id, info);
        }
        saveWidgetIds(kept);
    }

    private void showWidget(int id, AppWidgetProviderInfo info) {
        try {
            AppWidgetHostView view = widgetHost.createView(getApplicationContext(), id, info);
            view.setAppWidget(id, info);
            int height = Math.max(info.minHeight, dp(80));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height);
            lp.bottomMargin = dp(10);
            view.setTag(id);
            widgetsBox.addView(view, lp);
        } catch (Exception e) {
            Toast.makeText(this, "That widget could not be shown", Toast.LENGTH_SHORT).show();
        }
    }

    /** Every widget on the phone, by app and name; picking one binds it (Android may ask first). */
    private void pickWidget() {
        List<AppWidgetProviderInfo> providers = new ArrayList<>();
        for (UserHandle user : launcherApps.getProfiles()) providers.addAll(widgetManager.getInstalledProvidersForProfile(user));
        PackageManager pm = getPackageManager();
        List<String> names = new ArrayList<>();
        for (AppWidgetProviderInfo p : providers) {
            String app;
            try {
                app = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(p.provider.getPackageName(), 0)));
            } catch (Exception e) {
                app = p.provider.getPackageName();
            }
            names.add(app + "  ·  " + p.loadLabel(pm));
        }
        Integer[] order = new Integer[names.size()];
        for (int i = 0; i < order.length; i++) order[i] = i;
        Collator collator = Collator.getInstance();
        Arrays.sort(order, (a, b) -> collator.compare(names.get(a), names.get(b)));
        String[] shown = new String[order.length];
        for (int i = 0; i < order.length; i++) shown[i] = names.get(order[i]);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Add a widget")
            .setItems(shown, (d, which) -> bindWidget(providers.get(order[which])))
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void bindWidget(AppWidgetProviderInfo info) {
        int id = widgetHost.allocateAppWidgetId();
        boolean ok;
        try {
            ok = widgetManager.bindAppWidgetIdIfAllowed(id, info.getProfile(), info.provider, null);
        } catch (Exception e) {
            ok = false;
        }
        if (ok) {
            configureWidget(id);
            return;
        }
        pendingWidget = id;
        Intent ask = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, info.provider)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER_PROFILE, info.getProfile());
        try {
            startActivityForResult(ask, REQ_BIND);
        } catch (Exception e) {
            widgetHost.deleteAppWidgetId(id);
            pendingWidget = -1;
            Toast.makeText(this, "This phone doesn't let Onyx Home add widgets", Toast.LENGTH_LONG).show();
        }
    }

    private void configureWidget(int id) {
        AppWidgetProviderInfo info = widgetManager.getAppWidgetInfo(id);
        if (info == null) {
            widgetHost.deleteAppWidgetId(id);
            return;
        }
        boolean optional = Build.VERSION.SDK_INT >= 28 && (info.widgetFeatures & AppWidgetProviderInfo.WIDGET_FEATURE_CONFIGURATION_OPTIONAL) != 0;
        if (info.configure != null && !optional) {
            pendingWidget = id;
            try {
                widgetHost.startAppWidgetConfigureActivityForResult(this, id, 0, REQ_CONFIG, null);
                return;
            } catch (Exception e) {
                // shown without its setup
            }
        }
        addWidget(id);
    }

    private void addWidget(int id) {
        AppWidgetProviderInfo info = widgetManager.getAppWidgetInfo(id);
        if (info == null) {
            widgetHost.deleteAppWidgetId(id);
            return;
        }
        List<Integer> ids = widgetIds();
        if (!ids.contains(id)) ids.add(id);
        saveWidgetIds(ids);
        showWidget(id, info);
        pendingWidget = -1;
    }

    private void removeWidget() {
        List<Integer> ids = widgetIds();
        PackageManager pm = getPackageManager();
        String[] names = new String[ids.size()];
        for (int i = 0; i < ids.size(); i++) {
            AppWidgetProviderInfo info = widgetManager.getAppWidgetInfo(ids.get(i));
            names[i] = info == null ? "A widget that is gone" : String.valueOf(info.loadLabel(pm));
        }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Remove a widget")
            .setItems(names, (d, which) -> {
                int id = ids.get(which);
                widgetHost.deleteAppWidgetId(id);
                ids.remove(which);
                saveWidgetIds(ids);
                for (int i = 0; i < widgetsBox.getChildCount(); i++) {
                    if (Integer.valueOf(id).equals(widgetsBox.getChildAt(i).getTag())) {
                        widgetsBox.removeViewAt(i);
                        break;
                    }
                }
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        int id = data != null ? data.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pendingWidget) : pendingWidget;
        if (requestCode == REQ_BIND) {
            if (resultCode == RESULT_OK && id != -1) configureWidget(id);
            else if (id != -1) widgetHost.deleteAppWidgetId(id);
        } else if (requestCode == REQ_CONFIG) {
            if (resultCode == RESULT_OK && id != -1) addWidget(id);
            else if (id != -1) widgetHost.deleteAppWidgetId(id);
        }
        if (requestCode == REQ_BIND || requestCode == REQ_CONFIG) {
            if (resultCode != RESULT_OK) pendingWidget = -1;
        }
    }
}
