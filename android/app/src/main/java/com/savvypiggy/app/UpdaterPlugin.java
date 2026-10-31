package com.savvypiggy.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.WindowManager;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads a release from the project's GitHub page and hands it to Android's
 * own installer, which shows its confirmation and refuses anything not signed
 * with the key this app was signed with. Only that one repository's download
 * address is accepted, so nothing the page is given can point this elsewhere.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String ALLOWED = "https://github.com/JTing904/SavvyPiggy/releases/download/";

    /** Android blocks opening the installer from the background, so a finished download waits here. */
    private boolean visible = true;
    private File waiting;

    /** Whatever the last update left behind: it has done its job or it never finished. */
    @Override
    public void load() {
        new File(new File(getContext().getCacheDir(), "update"), "SavvyPiggy.apk").delete();
    }

    @Override
    protected synchronized void handleOnPause() {
        visible = false;
    }

    @Override
    protected synchronized void handleOnResume() {
        visible = true;
        if (waiting != null) {
            open(waiting);
            waiting = null;
        }
    }

    /** Whether Android will let this app open its installer. */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject out = new JSObject();
        out.put("allowed", allowed());
        call.resolve(out);
    }

    /** The system page where the person allows it. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Downloads `url`, reporting `progress`, then opens the installer. */
    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED) || !url.endsWith(".apk")) {
            call.reject("url");
            return;
        }
        // Android freezes an app in the background, which ends the download, so the screen stays on for it.
        keepScreenOn(true);
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "update");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("dir");
                File apk = new File(dir, "SavvyPiggy.apk");
                download(url, apk);
                deliver(apk);
                call.resolve();
            } catch (Exception e) {
                call.reject("download");
            } finally {
                keepScreenOn(false);
            }
        }).start();
    }

    private void keepScreenOn(boolean on) {
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private boolean allowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void download(String url, File into) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) throw new IllegalStateException("http " + code);
        long total = connection.getContentLengthLong();
        long done = 0;
        int last = -1;
        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(into)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                done += read;
                int percent = total > 0 ? (int) (done * 100 / total) : 0;
                if (percent != last) {
                    last = percent;
                    JSObject progress = new JSObject();
                    progress.put("percent", percent);
                    progress.put("done", done);
                    progress.put("total", total);
                    notifyListeners("progress", progress);
                }
            }
        } finally {
            connection.disconnect();
        }
        if (total > 0 && done != total) throw new IllegalStateException("short");
    }

    private synchronized void deliver(File apk) {
        if (visible) open(apk);
        else waiting = apk;
    }

    private void open(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
