package com.savvypiggy.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QuickReadPlugin.class);
        registerPlugin(BarsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Something was shared to the app while it was already open. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        PluginHandle handle = getBridge().getPlugin("QuickRead");
        if (handle != null && handle.getInstance() instanceof QuickReadPlugin) {
            ((QuickReadPlugin) handle.getInstance()).announceShare(intent);
        }
    }
}
