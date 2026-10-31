package com.savvypiggy.app;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.view.ViewParent;
import android.view.Window;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the status and navigation bars the colours of what is behind them:
 * `color` for both, or `nav` as well when the bottom of the page differs.
 *
 * Without this the clock sits on whatever the window happens to be, white on a
 * pale page.
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
                String nav = call.getString("nav");
                int bottom = nav == null ? color : Color.parseColor(nav);
                Window window = getActivity().getWindow();
                window.setStatusBarColor(color);
                window.setNavigationBarColor(bottom);
                // Edge to edge the bars are see-through and the window shows behind
                // them: the top half for the status bar, the bottom for the other.
                int[] halves = {color, color, bottom, bottom};
                window.getDecorView().setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, halves));
                // The WebView is inset by the bars, so what shows there is its own parents.
                ViewParent parent = getBridge().getWebView().getParent();
                while (parent instanceof View) {
                    ((View) parent).setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, halves));
                    parent = parent.getParent();
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("color");
            }
        });
    }
}
