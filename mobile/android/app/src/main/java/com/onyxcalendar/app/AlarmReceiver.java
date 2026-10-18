package com.onyxcalendar.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Android's alarm clock goes off here, even with the phone asleep: it starts the ringing
 * (AlarmService), which wakes the screen, and sets the next alarm.
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Intent ring = new Intent(ctx, AlarmService.class).setAction(AlarmService.ACTION_RING);
        if (intent.getExtras() != null) ring.putExtras(intent.getExtras());
        try {
            ctx.startForegroundService(ring);
        } catch (Exception e) {
            ctx.startService(ring);
        }
        LauncherData.prefs(ctx).edit().remove("alarm_set").apply();
        AlarmActivity.planNext(ctx);
    }
}
