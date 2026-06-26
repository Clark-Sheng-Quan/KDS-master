package com.anonymous.KDS;

import net.posprinter.POSConnect;
import net.posprinter.TSPLPrinter;
import net.posprinter.IDeviceConnection;
import net.posprinter.IConnectListener;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.hardware.usb.UsbManager;
import android.content.Context;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * Label printer native module (TSPL / TSC label printers).
 * Separate from Printer_K1215 which handles ESC/POS docket printers.
 *
 * JS calls printLabel({ sizeMm, gapMm, elements }) where elements is an array of:
 *   { type: "bar",    x, y, width, height }
 *   { type: "text",   x, y, content, fontSize, maxWidth }
 *   { type: "qrcode", x, y, content }
 */
public class LabelPrinter extends ReactContextBaseJavaModule {

    private static final String TAG = "LabelPrinter";
    private IDeviceConnection connection;

    public LabelPrinter(ReactApplicationContext reactContext) {
        super(reactContext);
        POSConnect.init(reactContext);
        connect();
    }

    @Override
    public String getName() {
        return "LabelPrinter";
    }

    // ── Connection ────────────────────────────────────────────────────────────

    private List<String> getUsbPaths() {
        List<String> paths = new ArrayList<>();
        try {
            UsbManager mgr = (UsbManager) getReactApplicationContext()
                    .getSystemService(Context.USB_SERVICE);
            if (mgr != null) {
                for (android.hardware.usb.UsbDevice d : mgr.getDeviceList().values()) {
                    paths.add(d.getDeviceName());
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "getUsbPaths: " + e.getMessage());
        }
        return paths;
    }

    private void connect() {
        for (String path : getUsbPaths()) {
            try {
                IDeviceConnection dev = POSConnect.createDevice(POSConnect.DEVICE_TYPE_USB);
                dev.connect(path, new IConnectListener() {
                    @Override
                    public void onStatus(int code, String info, String msg) {
                        if (code == POSConnect.CONNECT_SUCCESS) {
                            connection = dev;
                            Log.d(TAG, "connected: " + info);
                        }
                    }
                });
                break;
            } catch (Exception e) {
                Log.e(TAG, "connect error: " + e.getMessage());
            }
        }
    }

    @ReactMethod
    public void reconnect(Promise promise) {
        try {
            connection = null;
            connect();
            Thread.sleep(1000);
            promise.resolve(connection != null);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // ── Font query ────────────────────────────────────────────────────────────

    @ReactMethod
    public void queryFonts(Promise promise) {
        try {
            if (connection == null) { connect(); Thread.sleep(500); }
            if (connection == null) { promise.reject("NOT_CONNECTED", "Label printer not connected"); return; }
            connection.sendData("~!F\r\n".getBytes("US-ASCII"));
            connection.readData(3000, data -> {
                if (data == null || data.length == 0) promise.resolve("(no response)");
                else promise.resolve(new String(data, java.nio.charset.StandardCharsets.US_ASCII));
            });
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // ── Rendering helper ──────────────────────────────────────────────────────

    private Bitmap textToBitmap(String text, int sizePx, int maxWidthPx) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(sizePx);
        paint.setColor(Color.BLACK);
        paint.setTypeface(Typeface.DEFAULT);
        int w = Math.min((int) Math.ceil(paint.measureText(text)), maxWidthPx);
        if (w <= 0) w = 1;
        int h = (int) Math.ceil(paint.descent() - paint.ascent()) + 2;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);
        canvas.drawText(text, 0, -paint.ascent() + 1, paint);
        return bmp;
    }

    // ── Print ─────────────────────────────────────────────────────────────────

    /**
     * data shape:
     * {
     *   widthMm:  number,
     *   heightMm: number,
     *   gapMm:    number,
     *   elements: Array<
     *     { type: "bar",    x, y, width, height } |
     *     { type: "text",   x, y, content, fontSize, maxWidth } |
     *     { type: "qrcode", x, y, content }
     *   >
     * }
     */
    @ReactMethod
    public void printLabel(ReadableMap data, Promise promise) {
        try {
            if (connection == null) { connect(); Thread.sleep(500); }
            if (connection == null) { promise.reject("NOT_CONNECTED", "Label printer not connected"); return; }

            double widthMm  = data.hasKey("widthMm")  ? data.getDouble("widthMm")  : 40;
            double heightMm = data.hasKey("heightMm") ? data.getDouble("heightMm") : 30;
            double gapMm    = data.hasKey("gapMm")    ? data.getDouble("gapMm")    : 2;

            TSPLPrinter tspl = new TSPLPrinter(connection);
            tspl.sizeMm(widthMm, heightMm)
                .gapMm(gapMm, 0)
                .cls()
                .direction(1);

            ReadableArray elements = data.hasKey("elements") ? data.getArray("elements") : null;
            if (elements != null) {
                for (int i = 0; i < elements.size(); i++) {
                    ReadableMap el = elements.getMap(i);
                    String type = el.hasKey("type") ? el.getString("type") : "";

                    if ("bar".equals(type)) {
                        tspl.bar(el.getInt("x"), el.getInt("y"), el.getInt("width"), el.getInt("height"));

                    } else if ("text".equals(type)) {
                        String content  = el.hasKey("content")  ? el.getString("content")  : "";
                        int fontSize    = el.hasKey("fontSize")  ? el.getInt("fontSize")    : 22;
                        int maxWidth    = el.hasKey("maxWidth")  ? el.getInt("maxWidth")    : 300;
                        Bitmap bmp = textToBitmap(content, fontSize, maxWidth);
                        tspl.bitmap(el.getInt("x"), el.getInt("y"), 0, bmp.getWidth(), bmp);

                    } else if ("qrcode".equals(type)) {
                        String content = el.hasKey("content") ? el.getString("content") : "";
                        tspl.qrcode(el.getInt("x"), el.getInt("y"), "M", 3, "A", 0, content);
                    }
                }
            }

            tspl.print(1);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("PRINT_ERROR", e.getMessage());
        }
    }
}
