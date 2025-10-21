package com.anonymous.KDS;


import net.posprinter.POSConnect;
import com.facebook.react.bridge.ReactApplicationContext;
import net.posprinter.POSPrinter; // Adjust this based on the actual package structure of the library
import net.posprinter.IDeviceConnection; // Ensure this import is present
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
import java.util.Arrays;
import java.util.List;


import android.util.Log;


public class  Printer_K1215 extends ReactContextBaseJavaModule{


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
                            
                            // 初始化打印机
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
                // 如果打印机未初始化，尝试重新连接
                CreateUsbConnection();
                // 给打印机一些初始化时间
                Thread.sleep(1000);
                if (printer == null) {
                    promise.reject("PRINTER_ERROR", "打印机未连接");
                    return;
                }
            }
            
            // 检查打印机连接状态
            printer.isConnect(
                (int status) -> {
                    if (status != 1) {
                        promise.reject("PRINTER_ERROR", "打印机未连接，状态码: " + status);
                        return;
                    }
                    
                    try {
                        // 设置文本样式
                        int H2 = POSConst.TXT_1WIDTH | POSConst.TXT_1HEIGHT;
                        int H1 = POSConst.TXT_2WIDTH | POSConst.TXT_2HEIGHT;
                        
                        // 打印店铺信息
                        String shopName = orderData.hasKey("shopName") ? orderData.getString("shopName") : "KDS Restaurant";
                        if (shopName != null && !shopName.isEmpty()) {
                            printer.printText(shopName + "\n", POSConst.ALIGNMENT_CENTER, POSConst.FNT_BOLD, H1);
                        }
                        
                        // 打印订单信息
                        String orderId = orderData.hasKey("orderId") ? orderData.getString("orderId") : "N/A";
                        String orderTime = orderData.hasKey("orderTime") ? orderData.getString("orderTime") : "";
                        String pickupMethod = orderData.hasKey("pickupMethod") ? orderData.getString("pickupMethod") : "";
                        
                        if (orderId != null && !orderId.isEmpty()) {
                            printer.printText("Order #: " + orderId + "\n", POSConst.ALIGNMENT_LEFT, POSConst.FNT_DEFAULT, H2);
                        }
                        if (orderTime != null && !orderTime.isEmpty()) {
                            printer.printText("Time: " + orderTime + "\n", POSConst.ALIGNMENT_LEFT, POSConst.FNT_DEFAULT, H2);
                        }
                        if (pickupMethod != null && !pickupMethod.isEmpty()) {
                            printer.printText("Pickup: " + pickupMethod + "\n", POSConst.ALIGNMENT_LEFT, POSConst.FNT_DEFAULT, H2);
                        }
                        
                        if (orderData.hasKey("tableNumber")) {
                            String tableNumber = orderData.getString("tableNumber");
                            if (tableNumber != null && !tableNumber.isEmpty()) {
                                printer.printText("Table #: " + tableNumber + "\n", POSConst.ALIGNMENT_LEFT, POSConst.FNT_DEFAULT, H2);
                            }
                        }
                        
                        // 打印分隔线
                        printer.printText("--------------------------------\n", POSConst.ALIGNMENT_CENTER, POSConst.FNT_DEFAULT, H2);
                        
                        // 打印表头
                        printer.printText("Item                  Qty    Price\n", POSConst.ALIGNMENT_LEFT, POSConst.FNT_BOLD, H2);
                        printer.printText("--------------------------------\n", POSConst.ALIGNMENT_CENTER, POSConst.FNT_DEFAULT, H2);
                        
                        // 打印商品列表
                        ReadableArray items = orderData.hasKey("items") ? orderData.getArray("items") : null;
                        double total = 0;
                        
                        if (items != null && items.size() > 0) {
                            for (int i = 0; i < items.size(); i++) {
                                ReadableMap item = items.getMap(i);
                                if (item == null) continue;
                                
                                String name = item.hasKey("name") ? item.getString("name") : "Unknown Item";
                                double price = item.hasKey("price") ? item.getDouble("price") : 0;
                                int quantity = item.hasKey("quantity") ? item.getInt("quantity") : 1;
                                total += price * quantity;
                                
                                // 格式化商品行
                                String itemLine = String.format("%-20s %3d %8.2f\n", 
                                    name != null && name.length() > 20 ? name.substring(0, 17) + "..." : (name != null ? name : ""), 
                                    quantity, price);
                                printer.printText(itemLine, POSConst.ALIGNMENT_LEFT, POSConst.FNT_DEFAULT, H2);
                                
                                // 打印选项
                                if (item.hasKey("options")) {
                                    ReadableArray options = item.getArray("options");
                                    if (options != null && options.size() > 0) {
                                        for (int j = 0; j < options.size(); j++) {
                                            ReadableMap option = options.getMap(j);
                                            if (option == null) continue;
                                            
                                            String optName = option.hasKey("name") ? option.getString("name") : "";
                                            String optValue = option.hasKey("value") ? option.getString("value") : "";
                                            double optPrice = option.hasKey("price") ? option.getDouble("price") : 0;
                                            
                                            String optionLine = String.format("  - %s: %s", 
                                                optName != null ? optName : "", 
                                                optValue != null ? optValue : "");
                                            if (optPrice > 0) {
                                                optionLine += String.format(" (+%.2f)", optPrice);
                                                total += optPrice;
                                            }
                                            
                                            printer.printText(optionLine + "\n", POSConst.ALIGNMENT_LEFT, POSConst.FNT_DEFAULT, H2);
                                        }
                                    }
                                }
                            }
                        } else {
                            printer.printText("No items\n", POSConst.ALIGNMENT_CENTER, POSConst.FNT_DEFAULT, H2);
                        }
                        
                        // 打印合计
                        printer.printText("--------------------------------\n", POSConst.ALIGNMENT_CENTER, POSConst.FNT_DEFAULT, H2);
                        printer.printText(String.format("Total: $%.2f\n\n", total), POSConst.ALIGNMENT_RIGHT, POSConst.FNT_BOLD, H2);
                        
                        // 打印结束语
                        printer.printText("Thank you!\n", POSConst.ALIGNMENT_CENTER, POSConst.FNT_DEFAULT, H2);
                        
                        // 走纸并切纸
                        printer.feedLine(5);
                        printer.cutPaper(POSConst.CUT_ALL);
                        
                        promise.resolve(true);
                    } catch (Exception e) {
                        promise.reject("PRINT_ERROR", "Print error: " + e.getMessage());
                    }
                }
            );
        } catch (Exception e) {
            promise.reject("PRINT_ERROR", "打印初始化错误: " + e.getMessage());
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
