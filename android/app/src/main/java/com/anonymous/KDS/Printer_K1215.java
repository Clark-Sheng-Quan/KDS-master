package com.anonymous.KDS;


import net.posprinter.POSConnect;
import com.facebook.react.bridge.ReactApplicationContext;
import net.posprinter.POSPrinter;
import net.posprinter.IDeviceConnection;
import net.posprinter.IConnectListener;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import net.posprinter.POSConst; // Import the class that contains alignment constants
import net.posprinter.model.PTable;
// import com.vendingproject.ProductStorage;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import java.io.File;

import java.util.Set;
import java.util.List;
import java.io.ByteArrayOutputStream;
import java.text.SimpleDateFormat;
import java.util.Locale;
import android.util.Log;


public class  Printer_K1215 extends ReactContextBaseJavaModule{

    private static final String TAG = "Printer_K1215";
    private ReactApplicationContext appContext;
    private POSPrinter printer;
    public Printer_K1215(ReactApplicationContext reactContext){
        super(reactContext);

        this.appContext = reactContext;
        Log.d("kdsapp_log", "Printer activity created");
        POSConnect.init(reactContext);
        // GetConnectMac();
        // CreateConnection();
        CreateUsbConnection();
    }


    @Override
    public String getName() {
        return "Printer_K1215"; // Name to be used in JS
    }

    
    @ReactMethod
    public void PrinterStatus(Promise promise){
        promise.resolve("this is returned");
        Log.d("vendingapp_log", "Test clicked");
    }


    @ReactMethod
    public void Print(String text, boolean cutPaper, Promise promise){
        int H2 = POSConst.TXT_1WIDTH |POSConst.TXT_1HEIGHT ;

        if (printer != null){
              printer.isConnect(
                (int status) -> {          
                    
                    if (status == 1) {
                        printer.printText(text+ "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
                        // endiing
                        printer.feedLine(5);

                        if (cutPaper) printer.cutPaper(POSConst.CUT_ALL);
                        
                        promise.resolve(true);

                    }else{
                        promise.resolve(false);
                    }
                }
            );
        }else{
            Log.d("vendingapp_log", "Printer not Initialised");
            promise.reject("Err : Printer not initialised!");
        }
    }
    
    @ReactMethod
    public void isConnected(Promise promise){
        if (printer != null){
            printer.isConnect(
                (int status) -> {          
                    if (status == 1) promise.resolve(true);
                    else promise.resolve(false);
                    Log.d("vendingapp_log",  "printer connection status = " + status);
                }
            );

        }else{
            Log.d("kdsingapp_log", "Printer not Initialised");
            promise.reject("Printer not initialised!");
        }
    }


    private void GetConnectMac () { 


        // Initialize the Bluetooth adapter
        BluetoothAdapter bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        if (bluetoothAdapter == null) {
            Log.d("vendingapp_log", "Device doesn't support Bluetooth");
            return;
        }

        // Ensure Bluetooth is enabled
        if (!bluetoothAdapter.isEnabled()) {
            Log.d("vendingapp_log", "Bluetooth is not enabled");
            // You may need to prompt the user to enable Bluetooth
            return;
        }

        // Get paired devices
        Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
        if (pairedDevices.size() > 0) {
            for (BluetoothDevice device : pairedDevices) {
                // List the paired devices and their MAC addresses
                Log.d("vendingapp_log", "Device: " + device.getName() + ", MAC: " + device.getAddress());
            }
        }
    }

    private List<String> getUsbDevices(){
        return POSConnect.getUsbDevices(appContext);
    } 


    private void CreateUsbConnection() { 


        // Get the list of USB devices
        List<String> usbDevices = getUsbDevices();

        if (usbDevices != null && !usbDevices.isEmpty()) {
            for (String usbPath : usbDevices) {
                Log.d("vendingapp_log", "USB Device Path: " + usbPath);
                // create connection 
                if (CreateUsbConnectrion(usbPath)) break;
            }
        } else {
            Log.d("vendingapp_log", "No USB devices found");
        }
    }


    // @ReactMethod
    // public void PrintReceipt 
    // (   
    //     ReadableArray productArray,    
    //     String companyName,
    //     String ABN,
    //     String TEL,
    //     String ADDR,
    //     double GST,
    //     double Surcharge,
    //     double TOTAL,
    //     String QRLINK,
    //     String OID,
    //     String ShoppingMode,
    //     String BeeperNumber,
    //     String CustomerName,
    //     Promise promise
    // ){

    //     try{
    //         ProductStorage.Product[] p = new ProductStorage.Product[productArray.size()];
    //         for (int i =0; i < p.length; i++) {
    //             ReadableMap productMap = productArray.getMap(i);
    //             String name = productMap.getString("name");
    //             double price = productMap.getDouble("price");
    //             int qty = productMap.getInt("qty");
    //             p[i] = new ProductStorage.Product();
    //             p[i].name = name;
    //             p[i].price = price;
    //             p[i].qty = qty;
    //             p[i].weight = productMap.getDouble("qty");
    //             p[i].isWeighted =productMap.getBoolean("isWeighted");
    //             // Log.d("vendingapp_log", "name = " + p[i].name +  ", qty : " + p[i].qty + ", price : " + p[i].price );
    //         }

    //         PrintReceipt(p, companyName, ABN, TEL, ADDR, GST, Surcharge, TOTAL, QRLINK, OID, ShoppingMode, BeeperNumber, CustomerName);
    //         promise.resolve(true);
    //     }catch (Exception i){
    //         promise.reject("err" + i.getMessage());
    //     }
            

    // }

    // private void PrintReceipt(
    //     ProductStorage.Product[] products,
    //     String CompanyName,
    //     String ABN,
    //     String TEL,
    //     String ADDR,
    //     double GST,
    //     double Surcharge,
    //     double GrandTotal,
    //     String QRLink,
    //     String ORDERID,
    //     String ShoppingMode,
    //     String BeeperNumber,
    //     String CustomerName
    // ) throws Exception { 
    //     if (printer != null){ 
    
    //         int H2 = POSConst.TXT_1WIDTH |POSConst.TXT_1HEIGHT ;
    //         int H1 = POSConst.TXT_2WIDTH |POSConst.TXT_2HEIGHT;
    
    //         int BytesPerColumn = 48;                                                // # of characters per line
    
    
    //         char Line[] = new char[BytesPerColumn];
    //         for (int i=0; i < BytesPerColumn; i++) Line[i] = '-'; 
    //         String lineBreak = new String(Line);
            
    
    //         // COMPANT DESCRIPTION
    //         printer.printText(CompanyName + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_BOLD, H1);
    //         // printer.feedLine(1);
    //         printer.printText(  ShoppingMode + "\n" ,POSConst.ALIGNMENT_CENTER , POSConst.FNT_BOLD, H2);
    //         if (BeeperNumber != null)   printer.printText(  BeeperNumber + "\n" ,POSConst.ALIGNMENT_CENTER , POSConst.FNT_BOLD, H1);
    //         printer.feedLine(1);
    //         if (CustomerName != null)   printer.printText( "NAME : " + CustomerName + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "ORDER ID : " + ORDERID + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "ABN : " + ABN + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "TEL : " + TEL + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText(  ADDR + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.feedLine(1);        
    //         printer.printText(  lineBreak + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "TAX INVOICE" + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText(  lineBreak + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.feedLine(1);
    
    //         // CREATE PURCHASE TABLE
    //         String[] titles = {"Item", "Qty", "Price"};
    //         Integer[] numberOfSingleBytesPerCol = { (int)(0.60 * BytesPerColumn),  (int)(0.20 * BytesPerColumn) ,  (int)(0.20 * BytesPerColumn)};                                                           // Define column widths (single-byte characters per column)
    //                                                                                     // Define alignment for each column (0 = left, 1 = right)
    //         Integer[] align = {0, 0, 1};                                                // Left align 'Item', right align 'Quantity' and 'Price'
    //         PTable table = new PTable(titles, numberOfSingleBytesPerCol, align);        // Create PTable instance with custom alignment
    //         printer.feedLine(1);        
            
    //         for (int i=0; i < products.length; i++){ 
    //             ProductStorage.Product p = products[i];
    //             // table.addRow((i == 0 ? "\n" : ""),  new String[]{ (i+1) + ". " + p.name,     ( p.isWeighted  ?  Float.toString(p.weight) + "KG" :  Integer.toString(p.qty))  , "$" + (!p.isWeighted ? Double.toString(p.price) : (p.weight * p.price))  });
    //             table.addRow(
    //                 (i == 0 ? "\n" : ""), 
    //                 new String[] { 
    //                     (i + 1) + ". " + p.name,
    //                     p.isWeighted ? (p.weight + " KG") : (p.qty + ""),
    //                     "$" + (p.isWeighted ? (p.weight * p.price) : p.price)
    //                 }
    //             );



    //         }
    //         // // Print the table
    //         printer.printTable(table);

    //         // CREATE TOTAL 
    //         printer.feedLine(1);
    //         printer.printText(  lineBreak + "\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.feedLine(1);
    //         printer.printText( "Gst Inc : $" + GST + "\n", POSConst.ALIGNMENT_LEFT , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "Surcharge : $" + Surcharge + "\n", POSConst.ALIGNMENT_LEFT , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "Sub Total : $" +  ((GrandTotal)) + "\n", POSConst.ALIGNMENT_LEFT , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "Grand Total : $" +  ((GrandTotal + Surcharge)) + "\n", POSConst.ALIGNMENT_LEFT , POSConst.FNT_BOLD, H2);
    //         // printer.printText( "Grand Totalb4 : $" + (GrandTotal ) + "\n", POSConst.ALIGNMENT_LEFT , POSConst.FNT_BOLD, H2);
    
    //         // CREATE QR
    //         printer.feedLine(2);
    //         printer.printQRCode( QRLink , POSConst.ALIGNMENT_CENTER );
    //         printer.feedLine(2);
    
    //         printer.printText( "Scan QR to view digital receipt\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    //         printer.printText( "Thank you for your purchase!\n", POSConst.ALIGNMENT_CENTER , POSConst.FNT_DEFAULT, H2);
    
    //         // endiing
    //         printer.feedLine(5);
    //         printer.cutPaper(POSConst.CUT_ALL);
    //     }else{
    //         // return Promise.reject("Error : Cannot print receipt, Printer not iniitialised.");
    //         throw new Exception("Error : Cannot print receipt, Printer not iniitialised.");
    //     }
    // }


    private boolean CreateUsbConnectrion(String usbpath) {
        try {
            IDeviceConnection device = POSConnect.createDevice(POSConnect.DEVICE_TYPE_USB);
            device.connect(usbpath,
                new IConnectListener() {
                    @Override
                    public void onStatus(int code, String connectInfo, String message) {
                        if (code == POSConnect.CONNECT_SUCCESS) {
                            Log.d("kdsapp_log", "打印机连接成功: " + connectInfo);
                            Log.d("kdsapp_log", device.getConnectInfo());

                            printer = new POSPrinter(device);
                            printer.isConnect(
                                (int status) -> {
                                    if (status == 1) {
                                        Log.d("kdsapp_log", "打印机准备就绪");
                                    } else {
                                        Log.d("kdsapp_log", "打印机状态异常: " + status);
                                    }
                                }
                            );
                        } else {
                            Log.e("kdsapp_log", "连接失败: " + message + " (代码: " + code + ")");
                        }
                    }
                }
            );
            return true;
        } catch (Exception e) {
            Log.e("kdsapp_log", "连接过程中出错: " + e.getMessage());
            return false;
        }
    }

    private void CreateBluetoothConnection ()  { 
        IDeviceConnection  connect = POSConnect.createDevice(POSConnect.DEVICE_TYPE_BLUETOOTH);
        // Replace with the actual MAC address or a dynamically obtained one
        String macAddress = "12:34:56:78:9A:BC"; 
    
            
        IDeviceConnection connection = POSConnect.connectMac(macAddress, new IConnectListener() {
            @Override
            public void onStatus(int code, String connectInfo, String message) {
                if (code == POSConnect.CONNECT_SUCCESS) {
                    Log.d("vendingapp_log", "Device connected successfully: " + connectInfo);
                    // You can now initialize POSPrinter
                } else if (code == POSConnect.CONNECT_FAIL) {
                    Log.d("vendingapp_log", "Device connection failed: " + message);
                }
            }
        });



    }

    @ReactMethod
    public void printOrder(ReadableMap orderData, Promise promise) {
        try {
            if (printer == null) {
                CreateUsbConnection();
                Thread.sleep(1000);
                if (printer == null) {
                    promise.reject("PRINTER_ERROR", "打印机未连接");
                    return;
                }
            }
            
            printer.isConnect((int status) -> {
                if (status != 1) {
                    promise.reject("PRINTER_ERROR", "打印机未连接，状态码: " + status);
                    return;
                }
                
                try {
                    byte[] printBytes = buildKitchenDocketBytes(orderData);
                    printer.sendData(printBytes);
                    promise.resolve(true);
                } catch (Exception e) {
                    promise.reject("PRINT_ERROR", "打印错误: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            promise.reject("PRINT_ERROR", "打印初始化错误: " + e.getMessage());
        }
    }

    /**
     * 构建厨房订单单据的 ESC/POS 字节数组
     * 适配 80mm 热敏打印机
     */
    private byte[] buildKitchenDocketBytes(ReadableMap orderData) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        // 1. 初始化打印机
        baos.write(new byte[]{0x1B, 0x40});

        // 2. 表头（大、加粗、居中）
        baos.write(new byte[]{0x1B, 0x61, 0x01}); // 居中
        baos.write(new byte[]{0x1D, 0x21, 0x11}); // 双倍宽度和高度
        baos.write(new byte[]{0x1B, 0x45, 0x01}); // 加粗开启

        // 桌号
        if (orderData.hasKey("tableNumber")) {
            String tableNumber = orderData.getString("tableNumber");
            if (tableNumber != null && !tableNumber.trim().isEmpty()) {
                baos.write(("TABLE " + tableNumber + "\n").getBytes("GBK"));
            }
        }

        // 订单号
        if (orderData.hasKey("orderId")) {
            String orderId = orderData.getString("orderId");
            if (orderId != null && !orderId.isEmpty()) {
                baos.write(("ORDER #" + orderId + "\n").getBytes("GBK"));
            }
        }
        baos.write("\n".getBytes());

        // 3. 元数据（普通大小、左对齐）
        baos.write(new byte[]{0x1B, 0x61, 0x00}); // 左对齐
        baos.write(new byte[]{0x1D, 0x21, 0x00}); // 普通大小
        baos.write(new byte[]{0x1B, 0x45, 0x00}); // 加粗关闭

        // 时间
        String timeStr = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new java.util.Date());
        baos.write(createTwoColumnLine("Time:", timeStr));

        // 取餐方式
        if (orderData.hasKey("method")) {
            String method = orderData.getString("method");
            if (method != null && !method.isEmpty()) {
                baos.write(createTwoColumnLine("Method:", method));
            }
        }

        baos.write("------------------------------------------------\n\n".getBytes());

        // 4. 商品列表
        baos.write(new byte[]{0x1C, 0x26}); // 启用中文字符模式

        ReadableArray items = orderData.hasKey("items") ? orderData.getArray("items") : null;
        if (items != null && items.size() > 0) {
            for (int i = 0; i < items.size(); i++) {
                ReadableMap item = items.getMap(i);
                if (item == null) continue;

                String itemState = item.hasKey("itemState") ? item.getString("itemState") : "PROCESSED";
                boolean isVoided = "VOIDED".equals(itemState);

                // VOID 标记
                if (isVoided) {
                    baos.write(new byte[]{0x1B, 0x61, 0x01}); // 居中
                    baos.write("*** VOID ***\n".getBytes("GBK"));
                    baos.write(new byte[]{0x1B, 0x61, 0x00}); // 左对齐
                }

                // 商品名称行（加粗、1x2 大小）
                baos.write(new byte[]{0x1B, 0x45, 0x01}); // 加粗
                baos.write(new byte[]{0x1D, 0x21, 0x01}); // 双倍高度

                int quantity = item.hasKey("quantity") ? item.getInt("quantity") : 1;
                String name = item.hasKey("name") ? item.getString("name") : "Unknown Item";
                String qtyStr = (isVoided ? "-" : "") + quantity + "x";
                String nameStr = (isVoided ? "[VOID] " : "") + (name != null ? name : "");
                baos.write((qtyStr + " " + nameStr + "\n").getBytes("GBK"));

                // 恢复为普通格式
                baos.write(new byte[]{0x1D, 0x21, 0x00}); // 普通大小
                baos.write(new byte[]{0x1B, 0x45, 0x00}); // 加粗关闭

                // 后缀
                if (item.hasKey("suffix")) {
                    ReadableArray suffix = item.getArray("suffix");
                    if (suffix != null && suffix.size() > 0) {
                        for (int s = 0; s < suffix.size(); s++) {
                            ReadableMap suffixItem = suffix.getMap(s);
                            if (suffixItem != null && suffixItem.hasKey("name")) {
                                String suffixName = suffixItem.getString("name");
                                baos.write(("   " + suffixName + "\n").getBytes("GBK"));
                            }
                        }
                    }
                }

                // 选项/加菜
                if (item.hasKey("options")) {
                    ReadableArray options = item.getArray("options");
                    if (options != null && options.size() > 0) {
                        for (int j = 0; j < options.size(); j++) {
                            ReadableMap option = options.getMap(j);
                            if (option == null) continue;

                            String optName = option.hasKey("name") ? option.getString("name") : "";
                            String optValue = option.hasKey("value") ? option.getString("value") : "";
                            
                            baos.write(("   + " + (optName != null ? optName : "") + 
                                    (optValue != null && !optValue.isEmpty() ? ": " + optValue : "") + 
                                    "\n").getBytes("GBK"));
                        }
                    }
                }

                // 商品备注（加粗）
                if (item.hasKey("notes")) {
                    String notes = item.getString("notes");
                    if (notes != null && !notes.isEmpty()) {
                        baos.write(new byte[]{0x1B, 0x45, 0x01}); // 加粗开启
                        baos.write(("   Note: " + notes + "\n").getBytes("GBK"));
                        baos.write(new byte[]{0x1B, 0x45, 0x00}); // 加粗关闭
                    }
                }
                baos.write("\n".getBytes());
            }
        }

        // 5. 订单备注
        if (orderData.hasKey("notes")) {
            String notes = orderData.getString("notes");
            if (notes != null && !notes.isEmpty()) {
                baos.write("------------------------------------------------\n".getBytes());
                baos.write(new byte[]{0x1B, 0x45, 0x01}); // 加粗
                baos.write(("ORDER NOTE: " + notes + "\n").getBytes("GBK"));
                baos.write(new byte[]{0x1B, 0x45, 0x00}); // 加粗关闭
            }
        }

        baos.write(new byte[]{0x1C, 0x2E}); // 关闭中文模式

        // 6. 走纸和切纸
        baos.write("\n\n\n\n\n".getBytes());
        baos.write(new byte[]{0x1D, 0x56, 0x41, 0x03}); // 完全切纸命令

        return baos.toByteArray();
    }

    /**
     * 创建两列格式的打印行
     */
    private byte[] createTwoColumnLine(String label, String value) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int totalWidth = 48; // 80mm 打印机宽度（字符数）
        int labelWidth = label.length();
        int spacing = totalWidth - labelWidth - (value != null ? value.length() : 0);
        
        StringBuilder line = new StringBuilder(label);
        for (int i = 0; i < spacing; i++) {
            line.append(" ");
        }
        if (value != null) {
            line.append(value);
        }
        line.append("\n");
        
        baos.write(line.toString().getBytes("GBK"));
        return baos.toByteArray();
    }

    @ReactMethod
    public void beep(int count, int duration, Promise promise) {
        try {
            if (printer == null) {
                CreateUsbConnection();
                Thread.sleep(500);
                if (printer == null) {
                    promise.reject("PRINTER_ERROR", "打印机未连接");
                    return;
                }
            }

            printer.isConnect((int status) -> {
                if (status != 1) {
                    promise.reject("PRINTER_ERROR", "打印机未连接，状态码: " + status);
                    return;
                }
                try {
                    // ESC/POS beep: ESC B n t
                    byte n = (byte) Math.min(Math.max(count, 1), 9);
                    byte t = (byte) Math.min(Math.max(duration, 1), 9);
                    printer.sendData(new byte[]{0x1B, 0x42, n, t});
                    promise.resolve(true);
                } catch (Exception e) {
                    promise.reject("BEEP_ERROR", "蜂鸣器错误: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            promise.reject("BEEP_ERROR", "蜂鸣器初始化错误: " + e.getMessage());
        }
    }

    @ReactMethod
    public void reconnectPrinter(Promise promise) {
        try {
            // 先断开现有连接
            if (printer != null) {
                try {
                    // 简单地记录日志，不尝试关闭
                    Log.d("kdsapp_log", "尝试重新连接打印机");
                } catch (Exception e) {
                    Log.d("kdsapp_log", "重连打印机时出错: " + e.getMessage());
                }
                printer = null;
            }
            
            // 重新连接
            CreateUsbConnection();
            
            // 给打印机一些连接时间
            new Thread(() -> {
                try {
                    Thread.sleep(2000);
                    if (printer != null) {
                        printer.isConnect((int status) -> {
                            if (status == 1) {
                                promise.resolve(true);
                            } else {
                                promise.resolve(false);
                            }
                        });
                    } else {
                        promise.resolve(false);
                    }
                } catch (Exception e) {
                    promise.reject("RECONNECT_ERROR", e.getMessage());
                }
            }).start();
        } catch (Exception e) {
            promise.reject("RECONNECT_ERROR", e.getMessage());
        }
    }

}
