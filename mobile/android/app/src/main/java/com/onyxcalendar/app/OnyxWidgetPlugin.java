package com.onyxcalendar.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Hands the PC's address and token from the app to the home-screen widgets (they fetch
 * from the PC themselves), and asks them to refresh after a change in the app.
 */
@CapacitorPlugin(name = "OnyxWidget")
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
        call.resolve();
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        OnyxWidget.refreshAll(getContext());
        call.resolve();
    }
}
