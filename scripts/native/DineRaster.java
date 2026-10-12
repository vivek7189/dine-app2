package com.pinmi.react.printer.adapter;

// DINEOPEN_RASTER — copied into the printer library by scripts/patch-printer-native.js.
//
// Clean image printing for receipt printers (logo / full image receipt), the way POS apps do it:
// scale the picture to the paper's dot width, turn it into pure black & white, and send it as
// standard ESC/POS raster (GS v 0) in 24-row strips. The library's own image print used ESC *
// bit-image bands, which leave thin white lines on many printers, and on Bluetooth it shrank every
// image to 200 px. The byte building (pack) is plain Java so it can be unit-tested off-device.

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.net.Uri;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class DineRaster {
    public static final int BAND_ROWS = 24;
    public static final int THRESHOLD = 160; // luminance below this prints black

    // Load a picture from file://, a plain path, data:image/...;base64, or http(s).
    public static Bitmap load(String url) throws Exception {
        if (url == null || url.length() == 0) throw new Exception("no image");
        if (url.startsWith("data:")) {
            int comma = url.indexOf(',');
            byte[] b = Base64.decode(url.substring(comma + 1), Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(b, 0, b.length);
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            InputStream in = conn.getInputStream();
            try { return BitmapFactory.decodeStream(in); } finally { in.close(); conn.disconnect(); }
        }
        String p = url.startsWith("file:") ? Uri.parse(url).getPath() : url;
        return BitmapFactory.decodeFile(p);
    }

    // Picture → ESC/POS bytes at widthDots (384 = 58 mm, 576 = 80 mm).
    public static byte[] toEscPos(Bitmap src, int widthDots) throws Exception {
        if (src == null || src.getWidth() < 1 || src.getHeight() < 1) throw new Exception("image unreadable");
        int w = widthDots > 0 ? widthDots : 384;
        int h = Math.max(1, Math.min(8000, Math.round((float) src.getHeight() * w / src.getWidth())));
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        c.drawColor(Color.WHITE); // transparent logo pixels print as paper, not black
        Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        c.drawBitmap(src, new Rect(0, 0, src.getWidth(), src.getHeight()), new Rect(0, 0, w, h), paint);
        int[] argb = new int[w * h];
        out.getPixels(argb, 0, w, 0, 0, w, h);
        out.recycle();
        return pack(argb, w, h);
    }

    // Plain-Java core: ARGB pixels (already on white) → ESC a 0 + GS v 0 strips + line feed.
    public static byte[] pack(int[] argb, int w, int h) {
        int rowBytes = (w + 7) / 8;
        ByteArrayOutputStream bos = new ByteArrayOutputStream(16 + h * rowBytes + (h / BAND_ROWS + 1) * 8);
        bos.write(0x1B); bos.write(0x61); bos.write(0x00); // left align: the image is already paper-wide
        for (int y0 = 0; y0 < h; y0 += BAND_ROWS) {
            int rows = Math.min(BAND_ROWS, h - y0);
            bos.write(0x1D); bos.write(0x76); bos.write(0x30); bos.write(0x00);
            bos.write(rowBytes & 0xFF); bos.write((rowBytes >> 8) & 0xFF);
            bos.write(rows & 0xFF); bos.write((rows >> 8) & 0xFF);
            for (int y = y0; y < y0 + rows; y++) {
                for (int bx = 0; bx < rowBytes; bx++) {
                    int b = 0;
                    for (int bit = 0; bit < 8; bit++) {
                        int x = bx * 8 + bit;
                        if (x >= w) continue;
                        int p = argb[y * w + x];
                        int a = (p >>> 24) & 0xFF;
                        int r = (p >> 16) & 0xFF, g = (p >> 8) & 0xFF, bl = p & 0xFF;
                        // composite on white for any leftover transparency
                        r = (r * a + 255 * (255 - a)) / 255;
                        g = (g * a + 255 * (255 - a)) / 255;
                        bl = (bl * a + 255 * (255 - a)) / 255;
                        int lum = (299 * r + 587 * g + 114 * bl) / 1000;
                        if (lum < THRESHOLD) b |= (0x80 >> bit);
                    }
                    bos.write(b);
                }
            }
        }
        bos.write(0x0A);
        return bos.toByteArray();
    }

    public static String toBase64(String url, int widthDots) throws Exception {
        Bitmap src = load(url);
        if (src == null) throw new Exception("image not found");
        try {
            return Base64.encodeToString(toEscPos(src, widthDots), Base64.NO_WRAP);
        } finally {
            src.recycle();
        }
    }
}
