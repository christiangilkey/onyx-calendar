package com.onyxcalendar.app;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * The speech model "Hey Claude" listens with (Vosk's small English model, Apache 2.0): fetched once, when
 * it is first turned on, from Vosk's own site, and kept in the app's private files. Everything it hears
 * is turned into words on the phone with it; nothing is sent to hear it.
 */
final class VoiceModel {
    private VoiceModel() {}

    static final String URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
    static final long SIZE = 41_205_931L; // what Vosk's site serves, for the progress bar until it says

    private static volatile boolean downloading, cancelled;
    private static volatile long done, total = SIZE;
    private static volatile String error;

    static File dir(Context c) { return new File(c.getFilesDir(), "voice"); }
    static File model(Context c) { return new File(dir(c), "model"); }

    /** The model is all there (its acoustic model and its settings). */
    static boolean ready(Context c) {
        File m = model(c);
        return new File(m, "am/final.mdl").isFile() && new File(m, "conf/model.conf").isFile();
    }

    /** Fetches and unpacks it, in the background (one at a time). */
    static synchronized void download(Context ctx) {
        if (downloading) return;
        downloading = true;
        cancelled = false;
        done = 0;
        total = SIZE;
        error = null;
        Context c = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                fetchAndUnpack(c);
            } catch (Exception e) {
                error = cancelled ? null : (e.getMessage() == null ? "The download stopped." : e.getMessage());
            } finally {
                new File(dir(c), "model.zip").delete();
                deleteTree(new File(dir(c), "model.part"));
                downloading = false;
            }
        }, "onyx-voice-model").start();
    }

    static void cancel() { cancelled = true; }

    /** Takes the model off the phone (listening stops first). */
    static void remove(Context c) {
        cancelled = true;
        deleteTree(dir(c));
        error = null;
    }

    /** { model: none | downloading | ready | error, done, total, error } */
    static JSONObject state(Context c) {
        JSONObject o = new JSONObject();
        try {
            o.put("model", downloading ? "downloading" : ready(c) ? "ready" : error != null ? "error" : "none");
            o.put("done", done);
            o.put("total", total);
            o.put("size", SIZE);
            if (error != null) o.put("error", error);
        } catch (Exception ignored) {
            // plain values only
        }
        return o;
    }

    private static void fetchAndUnpack(Context c) throws IOException {
        File d = dir(c);
        if (!d.isDirectory() && !d.mkdirs()) throw new IOException("There's no room to keep the speech model.");
        File zip = new File(d, "model.zip");
        HttpURLConnection conn = (HttpURLConnection) new URL(URL).openConnection();
        try {
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code != 200) throw new IOException("Vosk's site answered " + code + ". Try again later.");
            long len = conn.getContentLengthLong();
            if (len > 0) total = len;
            if (d.getUsableSpace() < total * 3) throw new IOException("Not enough space on the phone: the model needs about 150 MB while it unpacks.");
            try (InputStream in = new BufferedInputStream(conn.getInputStream()); OutputStream out = new FileOutputStream(zip)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (cancelled) throw new IOException("Cancelled.");
                    out.write(buf, 0, n);
                    done += n;
                }
            }
        } catch (java.net.UnknownHostException e) {
            throw new IOException("No internet. Connect and try again.");
        } finally {
            conn.disconnect();
        }
        if (total > 0 && done < total) throw new IOException("The download stopped part way. Try again.");
        // Unpacked into a folder of its own, then put in place: a half-unpacked model is never used.
        File part = new File(d, "model.part");
        deleteTree(part);
        String root = part.getCanonicalPath() + File.separator;
        try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
            byte[] buf = new byte[64 * 1024];
            ZipEntry e;
            while ((e = zin.getNextEntry()) != null) {
                if (cancelled) throw new IOException("Cancelled.");
                String name = e.getName().replace('\\', '/');
                int slash = name.indexOf('/');
                String rel = slash >= 0 ? name.substring(slash + 1) : name; // the zip's own top folder is left out
                if (rel.isEmpty()) continue;
                File out = new File(part, rel);
                if (!out.getCanonicalPath().startsWith(root)) throw new IOException("The speech model's file looks wrong.");
                if (e.isDirectory()) { out.mkdirs(); continue; }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                try (OutputStream o = new FileOutputStream(out)) {
                    int n;
                    while ((n = zin.read(buf)) != -1) o.write(buf, 0, n);
                }
            }
        }
        File m = model(c);
        deleteTree(m);
        if (!part.renameTo(m)) throw new IOException("The speech model couldn't be put in place.");
        if (!ready(c)) {
            deleteTree(m);
            throw new IOException("The speech model was incomplete. Try again.");
        }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
