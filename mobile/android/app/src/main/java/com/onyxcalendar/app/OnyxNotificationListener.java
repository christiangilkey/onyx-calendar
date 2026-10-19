package com.onyxcalendar.app;

import android.app.Notification;
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
 * Needs Notification access (Settings, Home and lock screen). Private notifications show only
 * "Contents hidden" (or their public version), secret ones not at all, and Android's own choices
 * for the lock screen (no notifications, or no sensitive content) are kept.
 */
public class OnyxNotificationListener extends NotificationListenerService {
    private static volatile OnyxNotificationListener live;
    private static final List<Runnable> watchers = new CopyOnWriteArrayList<>();

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

    private static String str(CharSequence s) {
        return s == null ? null : s.toString().trim();
    }

    /** What to show under the panel: newest first, at most `max`. Empty without access or when the lock screen shows none. */
    static List<Item> items(Context ctx, int max) {
        List<Item> out = new ArrayList<>();
        OnyxNotificationListener l = live;
        if (l == null) return out;
        if (secure(ctx, "lock_screen_show_notifications", 1) == 0) return out; // Android: no notifications on the lock screen
        boolean privateHidden = secure(ctx, "lock_screen_allow_private_notifications", 1) == 0; // Android: hide sensitive content
        StatusBarNotification[] all;
        try {
            all = l.getActiveNotifications();
        } catch (Exception e) {
            return out;
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
            if (n.visibility == Notification.VISIBILITY_SECRET) continue;
            boolean hidden = privateHidden || n.visibility == Notification.VISIBILITY_PRIVATE;
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
