package com.anonymous.KDS;


import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import android.util.Log;
import java.net.InetAddress;


public class OrderServer {
  
    private static final String TAG = "VendServer";
    private static final int PORT = 4321;
    private boolean serverRunning = true;
    private ServerSocket serverSocket;

    public void startServer(OrderHandlerModule OrderModule){
        new Thread(() -> {
            try {
                Log.d(TAG, "正在启动服务器...");
                serverSocket = new ServerSocket(PORT, 50, InetAddress.getByName("0.0.0.0"));
                Log.d(TAG, "服务器启动成功！");

                while (serverRunning) {
                    try {
                        Log.d(TAG, "等待新的客户端连接...");
                        Socket clientSocket = serverSocket.accept();
                        Log.d(TAG, "新客户端已连接: " + clientSocket.getInetAddress());
                        new ClientHandler(clientSocket, OrderModule).start();
                    } catch (IOException e) {
                        if (serverRunning) {
                            Log.e(TAG, "处理客户端连接时出错: " + e.getMessage());
                        }
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "服务器启动失败: " + e.getMessage());
                e.printStackTrace();
            }
        }).start();
    }

    public void stopServer() {
        serverRunning = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (IOException e) {
            Log.e(TAG, "关闭服务器时出错: " + e.getMessage());
        }
    }

    static class ClientHandler extends Thread {
        private final Socket clientSocket;
        private final OrderHandlerModule orderModule;

        ClientHandler(Socket socket, OrderHandlerModule orderModule) {
            this.clientSocket = socket;
            this.orderModule = orderModule;
        }

        @Override
        public void run() {
            try (
                BufferedReader in = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
                PrintWriter out = new PrintWriter(clientSocket.getOutputStream(), true)
            ) {
                String message;
                StringBuilder b = new StringBuilder();
                while ((message = in.readLine()) != null) {
                    // Log.d(TAG, "收到数据行: " + message);
                    if (message.equalsIgnoreCase("end")) {
                        out.println("ok");
                        break;
                    }
                    b.append(message);
                }
                
                String completeData = b.toString();
                Log.d(TAG, "完整客户端请求 = " + completeData);
                
                try {
                    // 处理完整的订单数据
                    orderModule.AddOrder(completeData);
                    
                    // 发送确认消息
                    out.println("OK");
                    out.flush();
                    
                } catch (Exception e) {
                    Log.e(TAG, "处理订单时出错: " + e.getMessage());
                    out.println("ERROR: " + e.getMessage());
                    out.flush();
                }
                
            } catch (IOException e) {
                Log.e(TAG, "Socket IO错误: " + e.getMessage());
            }
        }
    }

    public static void Log(String text){
        System.out.println(text);
    }
}