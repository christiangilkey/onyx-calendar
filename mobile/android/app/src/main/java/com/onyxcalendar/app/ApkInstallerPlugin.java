package com.onyxcalendar.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

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
 * Updates the app from inside it: downloads the new APK from the GitHub release and
 * hands it straight to Android's installer, which asks for one "Install" tap.
 * (Android does not let an app outside the Play Store replace itself silently.)
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    /** Whether Android lets Onyx install updates (the "Install unknown apps" switch). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    /** Opens the settings page where the user allows Onyx to install updates. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Downloads `url` (reporting "progress" events) and opens the installer for it. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/")) {
            call.reject("Updates only come from the Onyx releases on GitHub.");
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not make room for the download.");
                File apk = new File(dir, "onyx-update.apk");

                // GitHub answers with a redirect to its download server; follow it (https only).
                URL current = new URL(url);
                for (int hops = 0; hops < 5; hops++) {
                    connection = (HttpURLConnection) current.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(30000);
                    int code = connection.getResponseCode();
                    if (code >= 300 && code < 400) {
                        URL next = new URL(current, connection.getHeaderField("Location"));
                        if (!"https".equals(next.getProtocol())) throw new Exception("Refused an insecure download link.");
                        connection.disconnect();
                        current = next;
                        continue;
                    }
                    if (code != 200) throw new Exception("The download failed (HTTP " + code + ").");
                    break;
                }

                long total = connection.getContentLengthLong();
                long done = 0;
                int lastPercent = -1;
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        done += read;
                        int percent = total > 0 ? (int) (done * 100 / total) : 0;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("progress", progress);
                        }
                    }
                }

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "The update could not be downloaded.");
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }
}
