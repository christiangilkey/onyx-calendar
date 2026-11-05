package com.onyxcalendar.app;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationManagerCompat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Your other apps' notifications, for the Onyx panel over the lock screen: Android hides its
 * own list behind anything shown there, so the panel lists them itself, under its own content.
 * Needs Notification access (Settings, Home and lock screen). They show in full, as on Android's own
 * lock screen: "Contents hidden" (or their public version) only when you chose to hide sensitive
 * content, or for an app you set to hide its content; secret ones not at all. Without a PIN,
 * pattern or password nothing is hidden, and with no notifications on the lock screen none show.
 */
public class OnyxNotificationListener extends NotificationListenerService {
    private static volatile OnyxNotificationListener live;
    private static final List<Runnable> watchers = new CopyOnWriteArrayList<>();
    private static final int NO_CHOICE = -1000; // Android's VISIBILITY_NO_OVERRIDE, which it keeps to itself

    /** One notification as the panel shows it. */
    static final class Item {
        String key, app, title, text;
        long when;
        Drawable icon;
        PendingIntent open;
        boolean clearable, autoCancel;
    }

    /** Whether Notification access is on for Onyx. */
    static boolean allowed(Context ctx) {
        return NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName());
    }

    static ComponentName component(Context ctx) {
        return new ComponentName(ctx, OnyxNotificationListener.class);
    }

    @Override
    public void onListenerConnected() {
        live = this;
        changed();
    }

    @Override
    public void onListenerDisconnected() {
        live = null;
        changed();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        changed();
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        changed();
    }

    /** Told whenever the list changes (from the listener's thread: post to the UI yourself). */
    static void watch(Runnable r) {
        watchers.add(r);
    }

    static void unwatch(Runnable r) {
        watchers.remove(r);
    }

    private static void changed() {
        for (Runnable r : watchers) {
            try {
                r.run();
            } catch (Exception ignored) {
                // one watcher's trouble is not the others'
            }
        }
    }

    private static int secure(Context ctx, String name, int fallback) {
        try {
            return Settings.Secure.getInt(ctx.getContentResolver(), name, fallback);
        } catch (Exception e) {
            return fallback;
        }
    }

    private static boolean isSecure(Context ctx) {
        try {
            KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
            return km == null || km.isDeviceSecure();
        } catch (Exception e) {
            return true;
        }
    }

    /** What you set for this app (or this kind of its notifications) on the lock screen: hide its content, hide it, or no choice. */
    private static int override(RankingMap ranks, String key) {
        if (ranks == null || key == null) return NO_CHOICE;
        try {
            Ranking r = new Ranking();
            if (!ranks.getRanking(key, r)) return NO_CHOICE;
            if (Build.VERSION.SDK_INT >= 31) return r.getLockscreenVisibilityOverride();
            NotificationChannel ch = r.getChannel();
            return ch == null ? NO_CHOICE : ch.getLockscreenVisibility();
        } catch (Exception e) {
            return NO_CHOICE;
        }
    }

    private static String str(CharSequence s) {
        return s == null ? null : s.toString().trim();
    }

    /** What to show under the panel: newest first, at most `max`. Empty without access or when the lock screen shows none. */
    static List<Item> items(Context ctx, int max) {
        List<Item> out = new ArrayList<>();
        OnyxNotificationListener l = live;
        if (l == null) return out;
        if (secure(ctx, "lock_screen_show_notifications", 1) == 0) return out; // Android: no notifications on the lock screen
        boolean locked = isSecure(ctx); // without a PIN, pattern or password Android hides nothing on the lock screen
        boolean privateHidden = secure(ctx, "lock_screen_allow_private_notifications", 1) == 0; // Android: hide sensitive content
        StatusBarNotification[] all;
        RankingMap ranks = null;
        try {
            all = l.getActiveNotifications();
        } catch (Exception e) {
            return out;
        }
        try {
            ranks = l.getCurrentRanking();
        } catch (Exception ignored) {
            // no per-app choices to go on: Android's own setting still counts
        }
        if (all == null) return out;
        Arrays.sort(all, (a, b) -> Long.compare(b.getPostTime(), a.getPostTime()));
        PackageManager pm = ctx.getPackageManager();
        for (StatusBarNotification s : all) {
            if (out.size() >= max) break;
            if (ctx.getPackageName().equals(s.getPackageName())) continue; // Onyx's own are in the panel already
            Notification n = s.getNotification();
            if (n == null) continue;
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) continue; // the group's own messages are listed
            if (s.isOngoing()) continue; // music, navigation, downloads: not news
            int mine = override(ranks, s.getKey());
            if (locked && (n.visibility == Notification.VISIBILITY_SECRET || mine == Notification.VISIBILITY_SECRET)) continue;
            // As Android does: an app you set to hide its content, or a private one (most are: it is the
            // default) only when you chose to hide sensitive content on the lock screen
            boolean hidden = locked && (mine == Notification.VISIBILITY_PRIVATE || privateHidden && n.visibility == Notification.VISIBILITY_PRIVATE);
            Notification shown = hidden && n.publicVersion != null ? n.publicVersion : n;
            Bundle x = shown.extras;
            String title = str(x.getCharSequence(Notification.EXTRA_TITLE));
            String text = str(x.getCharSequence(Notification.EXTRA_BIG_TEXT));
            if (text == null || text.isEmpty()) text = str(x.getCharSequence(Notification.EXTRA_TEXT));
            if (hidden && n.publicVersion == null) {
                title = null;
                text = "Contents hidden";
            }
            if ((title == null || title.isEmpty()) && (text == null || text.isEmpty())) continue;
            Item it = new Item();
            it.key = s.getKey();
            it.when = s.getPostTime();
            it.title = title;
            it.text = text;
            it.open = n.contentIntent;
            it.clearable = s.isClearable();
            it.autoCancel = (n.flags & Notification.FLAG_AUTO_CANCEL) != 0; // gone once opened, as from Android's own list
            it.app = s.getPackageName();
            try {
                ApplicationInfo ai = Build.VERSION.SDK_INT >= 33
                    ? n.extras.getParcelable("android.appInfo", ApplicationInfo.class)
                    : n.extras.getParcelable("android.appInfo");
                if (ai == null) ai = pm.getApplicationInfo(s.getPackageName(), 0);
                it.app = pm.getApplicationLabel(ai).toString();
                it.icon = pm.getApplicationIcon(ai);
            } catch (Exception e) {
                try {
                    Icon small = n.getSmallIcon();
                    if (small != null) it.icon = small.loadDrawable(ctx);
                } catch (Exception ignored) {
                    // no picture, just the name
                }
            }
            out.add(it);
        }
        return out;
    }

    /** Clears one (a long press on it in the panel). */
    static void dismiss(String key) {
        OnyxNotificationListener l = live;
        if (l == null || key == null) return;
        try {
            l.cancelNotification(key);
        } catch (Exception ignored) {
            // already gone
        }
    }
}
