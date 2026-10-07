package com.savvypiggy.app;

import android.graphics.Color;
import android.view.Window;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the status and navigation bars the colour of the page behind them.
 *
 * Before Android 15 the bars are solid and take the window's colour, so a light
 * page under a dark bar hides the clock. From Android 15 they are transparent and
 * the page shows through, and this changes nothing.
 */
@CapacitorPlugin(name = "Bars")
public class BarsPlugin extends Plugin {
    @PluginMethod
    public void setColor(PluginCall call) {
        final String value = call.getString("color");
        if (value == null) {
            call.reject("color");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                int color = Color.parseColor(value);
                Window window = getActivity().getWindow();
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
                call.resolve();
            } catch (Exception e) {
                call.reject("color");
            }
        });
    }
}
