package com.anonymous.KDS;




import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringWriter;
import java.util.Arrays;
import java.util.LinkedList;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Callback;
import android.util.Log;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.io.PrintWriter;

public class OrderHandlerModule extends ReactContextBaseJavaModule{

    // public static void main (String []args){ 
    //     OrderHandlerModule m = new OrderHandlerModule();
    // }

    private static final String TAG = "OrderHandlerModule";
    // private ReactApplicationContext appContext;
    // private Callback OrderCallbackFunct;
    private OrderServer Server; // 添加一个正确的类成员变量
    @Override
    public String getName(){
        return "OrderHandlerModule";
    }

    public static class Order{   
        String OrderID;
        String[] ItemName;
        Order(String orderID, String[] items) { 
            this.OrderID = orderID;
            this.ItemName = items;
        }
    }
    private ReactApplicationContext appContext;

 
    OrderHandlerModule(ReactApplicationContext reactContext) { 
        super(reactContext);
        this.appContext = reactContext;

        Log.d(TAG, "=== OrderHandlerModule Initialization ===");
        Log.d(TAG, "Creating OrderServer instance...");
        this.Server = new OrderServer(); // 使用类成员变量
        
        Log.d(TAG, "Starting TCP server...");
        this.Server.startServer(this);
        Log.d(TAG, "Module initialization completed");
        
        Runtime.getRuntime().addShutdownHook(
            new Thread(() -> {
                Log.d(TAG, "Shutting down server");
                this.Server.stopServer();
            })
        );
    }


    private Callback OrderCallbackFunct;

    @ReactMethod
    public void BindCallback (Callback callback) { 
        this.OrderCallbackFunct = callback;
    }


    @ReactMethod
    public void TestAdd (){
        if (this.OrderCallbackFunct != null) { 
            this.OrderCallbackFunct.invoke("test call added");
        } 
    }
    
    public void AddOrder(String orderstring) { 
        try {
            Log.d(TAG, "Received order: " + orderstring);
            if (this.OrderCallbackFunct != null) {
                // 在主线程中执行回调
                appContext.runOnUiQueueThread(() -> {
                    try {
                        this.OrderCallbackFunct.invoke(orderstring);
                    } catch (Exception e) {
                        Log.e(TAG, "Error invoking callback: " + e.getMessage());
                    }
                });
            } else {
                Log.e(TAG, "OrderCallbackFunct is null");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in AddOrder: " + e.getMessage());
        }
    }

    private int parseCounter;

    private void ParseOrder (String orderString) {
        String productName[] = null;
        String ordeRID = null;
        boolean newProduct = false;        
        double productIndicie = 0;

        try{
            for (parseCounter=0; parseCounter < orderString.length(); parseCounter++ ) { 
                char character = (char) orderString.charAt(parseCounter) ;             // currenct character
                // if (productoptions != null)  System.out.println("comppp" + character);
                // checkers
                if (character == '}'){
                    newProduct = false;         // product end

                    // System.out.println("Creating new order, order id = " + ordeRID + " products = " + Arrays.toString(productName));
                    Order currentOrder = new Order(ordeRID, productName);
                    System.out.println("Order created with " + currentOrder.OrderID);
                }   
                if (character == '{'){                  // new product line
                    newProduct = true;
                    productIndicie = 0;                 // reset indicie
                }
        
                if (newProduct && character == '"'){
                    productIndicie += 1 ;                           
        
                    if (productIndicie == Math.floor(productIndicie)){         // verify whole number
        
                        // map indices
                        switch(  (int)Math.floor(productIndicie) ){
                            case 1 :  
                                ordeRID = parseSingleValue( orderString);
                                // System.out.println("ordeRID = " + ordeRID);
                            break;
                            case 2 : 
                                productName = parseSingleArray(orderString);
                                // System.out.println(Arrays.toString(parseSingleArray(orderString)));
                                // parseSingleArray(orderString) ;
                                newProduct =false;
                            // break;
                        }
        
                    }
                }
                // }
                // index++;
            }
        }catch(Exception k) { 

        }

    }


    /**
     * Attempt to read the single array starting at the current position in buffer reader. 
     *      Format to parse :  [ "url1", "url2",  ]"
     * @param reader
     * @return the parsed array of urls.
     */
    private  String[] parseSingleArray (String meta) throws IOException { 

        StringBuffer b = new StringBuffer();
        LinkedList<String> urls = new LinkedList<>();
        boolean inArray = false;
        int counter =0;
        // parseCounter++;

        // System.out.println("parsing meta at" + parseCounter + " . at --> " + meta.charAt(parseCounter));
        // while ((ch = reader.read()) != -1){
        for (;  parseCounter < meta.length(); parseCounter++){
            char character = (char)meta.charAt(parseCounter);
            
            if (character == '[') inArray = true;
            if (character == ']') break;     // end of array
            if (inArray && character == '"') counter++;

            if (counter != 0){
                if ( (counter % 2) == 0 ){   
                    urls.push(b.toString());
                    b = new StringBuffer();
                    counter = 0;
                }else{
                    if (character != '"') b.append(character);
                }
            }

        }
    
        return urls.toArray(new String[0]);
    }
    


     private String parseSingleValue (String meta) { 
        StringBuffer b = new StringBuffer();

        parseCounter++;
        // System.out.println("parsing index : "+ parseCounter);
        for (; parseCounter < meta.length(); parseCounter++){
            char character = (char)meta.charAt(parseCounter);
            if (character == '"'){
                return b.toString();
            } 
            b.append(character);
        }

        return null;
    }

    @ReactMethod
    public void closeServer() {
        try {
            if (this.Server != null) {
                this.Server.stopServer();
                this.Server = null;
            }
            Log.d(TAG, "TCP server closed successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error closing TCP server: " + e.getMessage());
        }
    }

    @ReactMethod
    public void sendTCPData(String targetIP, String data, Promise promise) {
        new Thread(() -> {
            Socket socket = null;
            try {
                socket = new Socket();
                socket.connect(new InetSocketAddress(targetIP, 4321), 5000); // 3秒超时
                
                PrintWriter out = new PrintWriter(socket.getOutputStream(), true);
                out.println(data);
                out.flush();
                
                promise.resolve(true);
            } catch (Exception e) {
                Log.e("OrderHandlerModule", "发送TCP数据失败: " + e.getMessage());
                promise.reject("TCP_ERROR", "发送TCP数据失败: " + e.getMessage());
            } 
        }).start();
    }

}
