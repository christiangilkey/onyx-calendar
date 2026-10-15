package com.onyxcalendar.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;

/**
 * Taps on a widget's list rows land here (an invisible screen that closes at once):
 * "open" opens the app on that day, "done" ticks the task off in the background.
 */
public class WidgetActionActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent i = getIntent();
        String what = i.getStringExtra(OnyxWidget.EXTRA_DO);
        int id = i.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if ("done".equals(what) && i.getStringExtra(OnyxWidget.EXTRA_TASK) != null) {
            OnyxWidget.completeInBackground(this, id, i.getStringExtra(OnyxWidget.EXTRA_TASK));
        } else if ("open".equals(what)) {
            OnyxWidget.openApp(this, "calendar", i.getStringExtra(OnyxWidget.EXTRA_DATE));
        }
        finish();
        overridePendingTransition(0, 0);
    }
}
