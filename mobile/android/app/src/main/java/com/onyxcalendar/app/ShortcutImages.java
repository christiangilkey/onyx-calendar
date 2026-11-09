package com.onyxcalendar.app;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * A picture of your own as a shortcut's icon, in place of its emoji (LockShortcuts.mark). Picked on the phone:
 * JPEG, PNG, WebP, a GIF's first frame, BMP, and HEIC/HEIF or AVIF where Android reads them; an SVG is drawn by
 * the app and handed back as a PNG (OnyxWidgetPlugin.saveShortcutImage). Cut to its middle square, SIZE pixels
 * across, and kept as a PNG in the app's own storage (files/shortcut-icons). The shortcut keeps only the file's
 * name ("image"); one whose file is gone shows its emoji instead.
 */
final class ShortcutImages {
    /** Pixels across: sharp at the big tile's 44dp on the densest screens. */
    static final int SIZE = 192;
    private static final String DIR = "shortcut-icons";
    /** A kept picture's name: made here (keep()), never a path. */
    static final Pattern NAME = Pattern.compile("[a-z0-9]{8,40}\\.png");
    /** The most an SVG may be, as text. */
    static final int SVG_MAX = 1024 * 1024;
    /** Pictures no shortcut uses are cleared away once this old: one picked a moment ago may not be saved yet. */
    private static final long KEEP_NEW_MS = 60 * 60 * 1000L;
    private static final SecureRandom RANDOM = new SecureRandom();

    private ShortcutImages() {}

    /** Why a picture can't be used, in words for the person picking it. */
    static final class Unusable extends IOException {
        Unusable(String why) {
            super(why);
        }
    }

    static boolean valid(String name) {
        return name != null && NAME.matcher(name).matches();
    }

    private static File dir(Context ctx) {
        return new File(ctx.getFilesDir(), DIR);
    }

    /** The file a name stands for, or null for a name that isn't one of ours. */
    static File file(Context ctx, String name) {
        return valid(name) ? new File(dir(ctx), name) : null;
    }

    /** A shortcut's picture, or null when it has none or its file is gone (or can't be read). */
    static Bitmap load(Context ctx, String name) {
        File f = file(ctx, name);
        if (f == null || !f.isFile()) return null;
        try {
            return BitmapFactory.decodeFile(f.getPath());
        } catch (Exception e) {
            return null;
        }
    }

    /** Is it an SVG (by its kind, or else its name)? Android can't read those itself. */
    static boolean isSvg(String type, String name) {
        if (type != null && type.toLowerCase(java.util.Locale.ROOT).startsWith("image/svg")) return true;
        return name != null && name.toLowerCase(java.util.Locale.ROOT).endsWith(".svg");
    }

    /** An SVG's text, for the app to draw. */
    static String svgText(Context ctx, Uri uri) throws IOException {
        try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Unusable("That picture couldn't be opened.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = in.read(buf)) > 0; ) {
                out.write(buf, 0, n);
                if (out.size() > SVG_MAX) throw new Unusable("That SVG is too big to use as an icon.");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /** How much to shrink while reading: by halves, while the short side stays at least SIZE. */
    static int sample(int w, int h) {
        int side = Math.min(w, h), n = 1;
        while (side / (n * 2) >= SIZE) n *= 2;
        return n;
    }

    /**
     * A picked picture, read already shrunk near SIZE and the right way up. Android 9 and later read it with
     * ImageDecoder (HEIC/HEIF too, AVIF from 12, a GIF's or WebP's first frame, and its EXIF turn); before that,
     * BitmapFactory, turned by its EXIF orientation. Null, or an IOException, when it can't be read.
     */
    static Bitmap decode(Context ctx, Uri uri) throws IOException {
        ContentResolver cr = ctx.getContentResolver();
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.Source src = ImageDecoder.createSource(cr, uri);
            return ImageDecoder.decodeBitmap(src, (decoder, info, source) -> {
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE); // drawn into a Canvas next: not a hardware bitmap
                decoder.setTargetSampleSize(sample(info.getSize().getWidth(), info.getSize().getHeight()));
            });
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = cr.openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inSampleSize = sample(bounds.outWidth, bounds.outHeight);
        Bitmap b;
        try (InputStream in = cr.openInputStream(uri)) {
            b = BitmapFactory.decodeStream(in, null, o);
        }
        if (b == null) return null;
        int turn = 0;
        try (InputStream in = cr.openInputStream(uri)) {
            if (in != null) {
                switch (new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    case ExifInterface.ORIENTATION_ROTATE_90: turn = 90; break;
                    case ExifInterface.ORIENTATION_ROTATE_180: turn = 180; break;
                    case ExifInterface.ORIENTATION_ROTATE_270: turn = 270; break;
                    default: break;
                }
            }
        } catch (Exception ignored) {
            // no EXIF (a PNG, a GIF): as it is
        }
        if (turn == 0) return b;
        Matrix m = new Matrix();
        m.postRotate(turn);
        return Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
    }

    /** A PNG the app drew (an SVG), or null when it isn't one. */
    static Bitmap decode(byte[] png) {
        if (png == null || png.length == 0) return null;
        return BitmapFactory.decodeByteArray(png, 0, png.length);
    }

    /** Its middle square, SIZE across. */
    static Bitmap square(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight(), side = Math.min(w, h);
        int x = (w - side) / 2, y = (h - side) / 2;
        Bitmap out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888);
        new Canvas(out).drawBitmap(b, new Rect(x, y, x + side, y + side), new Rect(0, 0, SIZE, SIZE),
            new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG));
        return out;
    }

    /** Keeps it (its middle square) under a new name, which it answers with. */
    static String keep(Context ctx, Bitmap b) throws IOException {
        File dir = dir(ctx);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new Unusable("There's no room on the phone to keep that picture.");
        tidy(ctx);
        String name = Long.toString(System.currentTimeMillis(), 36) + Long.toString(RANDOM.nextLong() & Long.MAX_VALUE, 36) + ".png";
        File f = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(f)) {
            if (!square(b).compress(Bitmap.CompressFormat.PNG, 100, out)) throw new Unusable("That picture couldn't be kept.");
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
            throw e;
        }
        return name;
    }

    /** For the editor: { name: address } of the pictures that list uses, the ones still on the phone. */
    static JSONObject urls(Context ctx, String prefix, JSONArray list) {
        JSONObject o = new JSONObject();
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject s = list.optJSONObject(i);
            String name = s == null ? null : s.optString("image");
            File f = file(ctx, name);
            if (f == null || !f.isFile()) continue;
            try {
                o.put(name, prefix + f.getAbsolutePath());
            } catch (Exception ignored) {
                // plain values
            }
        }
        return o;
    }

    /**
     * Clears away the pictures no shortcut uses, on either screen: one changed for another, a shortcut
     * removed, or a picture picked and never saved (left an hour first, in case its shortcut is still being made).
     */
    static void tidy(Context ctx) {
        File[] files = dir(ctx).listFiles();
        if (files == null) return;
        Set<String> used = new HashSet<>();
        for (String screen : new String[] { LockLayout.LOCK, LockLayout.HOME }) {
            JSONArray list = LockShortcuts.list(ctx, screen);
            for (int i = 0; i < list.length(); i++) {
                JSONObject s = list.optJSONObject(i);
                if (s != null) used.add(s.optString("image"));
            }
        }
        long now = System.currentTimeMillis();
        for (File f : files) {
            //noinspection ResultOfMethodCallIgnored
            if (!used.contains(f.getName()) && now - f.lastModified() > KEEP_NEW_MS) f.delete();
        }
    }
}
