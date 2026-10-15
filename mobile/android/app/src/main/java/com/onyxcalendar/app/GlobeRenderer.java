package com.onyxcalendar.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Draws the globe for the home-screen widget: a sphere with a cluster for each tag, the
 * entries around it, joined to their cluster, seen from `yaw` degrees around. A widget
 * can't host the app's live 3D globe, so it is drawn as a picture and turned with buttons.
 */
final class GlobeRenderer {
    private GlobeRenderer() {}

    private static final class P {
        float x, y, z; // projected: screen x, y and depth (-1 back .. 1 front)
        P(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
    }

    private static final class Dot {
        P p; int color; float r; boolean hub; String label;
    }

    static Bitmap render(Map<String, List<WidgetItems.Node>> clusters, java.util.function.ToIntFunction<String> tagColor,
                         int width, int height, float yawDeg, float density) {
        Bitmap bmp = Bitmap.createBitmap(Math.max(width, 1), Math.max(height, 1), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float cx = width / 2f, cy = height / 2f;
        float radius = Math.min(width, height) * 0.36f;
        double yaw = Math.toRadians(yawDeg), pitch = Math.toRadians(-20);

        // Atmosphere and the sphere's edge.
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setShader(new RadialGradient(cx, cy, radius * 1.35f,
            new int[] { 0x10000000 | 0x8B7CFF, 0x188B7CFF, 0x00000000 }, new float[] { 0.55f, 0.75f, 1f }, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, radius * 1.35f, glow);
        Paint wire = new Paint(Paint.ANTI_ALIAS_FLAG);
        wire.setStyle(Paint.Style.STROKE);
        wire.setStrokeWidth(Math.max(1f, density * 0.7f));
        wire.setColor(0x33A9A0FF);
        c.drawCircle(cx, cy, radius, wire);
        // Lines of latitude and longitude, turned with the globe.
        wire.setColor(0x1FA9A0FF);
        for (int lat = -60; lat <= 60; lat += 30) {
            float ry = (float) Math.sin(Math.toRadians(lat));
            float rr = (float) Math.cos(Math.toRadians(lat)) * radius;
            float y = cy - (float) (ry * Math.cos(pitch)) * radius;
            c.drawOval(new RectF(cx - rr, y - rr * (float) Math.abs(Math.sin(pitch)), cx + rr, y + rr * (float) Math.abs(Math.sin(pitch))), wire);
        }
        for (int lon = 0; lon < 180; lon += 45) {
            float w = (float) Math.abs(Math.cos(Math.toRadians(lon) + yaw)) * radius;
            c.drawOval(new RectF(cx - w, cy - radius, cx + w, cy + radius), wire);
        }

        // Clusters on the sphere (largest first), spread evenly; untagged ("") last.
        List<String> keys = new ArrayList<>(clusters.keySet());
        Collections.sort(keys, (a, b) -> {
            if (a.isEmpty() != b.isEmpty()) return a.isEmpty() ? 1 : -1;
            return clusters.get(b).size() - clusters.get(a).size();
        });
        if (keys.size() > 16) keys = keys.subList(0, 16);
        int n = keys.size();
        List<Dot> dots = new ArrayList<>();
        List<float[]> links = new ArrayList<>(); // x1, y1, x2, y2, color, depth
        double golden = Math.PI * (3 - Math.sqrt(5));
        for (int i = 0; i < n; i++) {
            String key = keys.get(i);
            List<WidgetItems.Node> items = clusters.get(key);
            double y = n == 1 ? 0 : 1 - (i / (double) (n - 1)) * 2;
            double ring = Math.sqrt(Math.max(0, 1 - y * y));
            double t = golden * i;
            double hx = Math.cos(t) * ring, hy = y * 0.85, hz = Math.sin(t) * ring;
            int color = key.isEmpty() ? 0xFF8A8A94 : tagColor.applyAsInt(key);
            P hub = project(hx, hy, hz, yaw, pitch, cx, cy, radius);
            // Its entries sit around it, just off the surface.
            int count = Math.min(items.size(), 24);
            for (int j = 0; j < count; j++) {
                double a = j * 2.39996, d = 0.16 + 0.035 * Math.sqrt(j);
                // A small step on the sphere's surface, in two directions at right angles to the hub.
                double ux = -Math.sin(t), uz = Math.cos(t);
                double vx = -hy * Math.cos(t), vy = ring, vz = -hy * Math.sin(t);
                double px = hx + d * (Math.cos(a) * ux + Math.sin(a) * vx);
                double py = hy + d * (Math.sin(a) * vy);
                double pz = hz + d * (Math.cos(a) * uz + Math.sin(a) * vz);
                double len = Math.sqrt(px * px + py * py + pz * pz);
                P p = project(px / len * 1.04, py / len * 1.04, pz / len * 1.04, yaw, pitch, cx, cy, radius);
                Dot dot = new Dot();
                dot.p = p; dot.color = items.get(j).color; dot.r = density * 2.4f;
                dots.add(dot);
                links.add(new float[] { hub.x, hub.y, p.x, p.y, color, (hub.z + p.z) / 2 });
            }
            Dot h = new Dot();
            h.p = hub; h.color = color; h.hub = true;
            h.r = density * (4.5f + (float) Math.sqrt(items.size()) * 1.4f);
            h.label = (key.isEmpty() ? "Untagged" : "#" + key) + "  " + items.size();
            dots.add(h);
        }

        // Back to front, faded at the back.
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStrokeWidth(Math.max(1f, density * 0.6f));
        for (float[] l : links) {
            line.setColor(withAlpha((int) l[4], 40 + (int) (60 * (l[5] + 1) / 2)));
            c.drawLine(l[0], l[1], l[2], l[3], line);
        }
        Collections.sort(dots, (a, b) -> Float.compare(a.p.z, b.p.z));
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(density * 10.5f);
        text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        text.setTextAlign(Paint.Align.CENTER);
        boolean roomForLabels = Math.min(width, height) > 150 * density;
        for (Dot d : dots) {
            float depth = (d.p.z + 1) / 2; // 0 back .. 1 front
            int alpha = (int) (70 + 185 * depth);
            if (d.hub) {
                fill.setShader(new RadialGradient(d.p.x, d.p.y, d.r * 3, withAlpha(d.color, (int) (110 * depth)), 0, Shader.TileMode.CLAMP));
                c.drawCircle(d.p.x, d.p.y, d.r * 3, fill);
                fill.setShader(null);
                fill.setColor(withAlpha(d.color, alpha));
                c.drawCircle(d.p.x, d.p.y, d.r, fill);
                fill.setColor(withAlpha(Color.BLACK, (int) (140 * depth)));
                c.drawCircle(d.p.x, d.p.y, d.r * 0.42f, fill);
                if (roomForLabels && d.p.z > -0.15f) {
                    text.setColor(withAlpha(0xFFF1F1F4, (int) (90 + 165 * depth)));
                    c.drawText(d.label, d.p.x, d.p.y + d.r + text.getTextSize() * 1.15f, text);
                }
            } else {
                fill.setColor(withAlpha(d.color, alpha));
                c.drawCircle(d.p.x, d.p.y, d.r, fill);
            }
        }
        if (n == 0) {
            text.setColor(0xFF7F7F89);
            text.setTypeface(Typeface.DEFAULT);
            c.drawText("Nothing on the globe yet", cx, cy, text);
        }
        return bmp;
    }

    /** Turns a point on the unit sphere by yaw and pitch and places it on the picture. */
    private static P project(double x, double y, double z, double yaw, double pitch, float cx, float cy, float radius) {
        double x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
        double z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
        double y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
        double z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
        return new P(cx + (float) x1 * radius, cy - (float) y2 * radius, (float) Math.max(-1, Math.min(1, z2)));
    }

    private static int withAlpha(int color, int alpha) {
        return (Math.max(0, Math.min(255, alpha)) << 24) | (color & 0x00FFFFFF);
    }
}
