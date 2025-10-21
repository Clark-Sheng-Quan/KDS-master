/**
 * KDS TCP Socket通信测试脚本 - 子KDS/主KDS模式
 *
 * 使用方法：
 * 在命令行运行: node kds_socket_test.js [ip地址] [分类] [模式]
 *
 * 示例:
 *   - 连接到本地主KDS: node kds_socket_test.js 127.0.0.1 Drinks
 *   - 连接到模拟器: node kds_socket_test.js 10.0.2.16 hot_food
 *   - 默认连接本地，饮料分类: node kds_socket_test.js
 *   - 主KDS模式: node kds_socket_test.js 127.0.0.1 Drinks master
 */

const net = require("net");

// 配置
const TCP_PORT = 4322;
const targetIP = process.argv[2] || "127.0.0.1"; // 默认连接本地
const category = process.argv[3] || "Drinks"; // 默认饮料分类
const mode = process.argv[4] || "slave"; // 默认子KDS模式

console.log(
  `KDS测试程序启动，模式: ${mode}, ${
    mode === "slave"
      ? `连接到: ${targetIP}:${TCP_PORT}，分类: ${category}`
      : `监听端口: ${TCP_PORT}`
  }`
);

// 创建样本订单
function createSampleOrder(orderType = "") {
  const newOrder = {
    id: `test-${Date.now()}`,
    order_num: Math.floor(Math.random() * 1000),
    orderTime: new Date().toISOString(),
    pickupTime: new Date(Date.now() + 15 * 60000).toISOString(),
    pickupMethod: "takeaway",
    source: "tcp",
    products: [
      {
        id: "p1",
        name: "Mountain Dew",
        category: "Drinks",
        quantity: 1,
        price: 3.99,
        options: [],
      },
      {
        id: "p2",
        name: "Hamburger",
        category: "hot_food",
        quantity: 1,
        price: 5.99,
        options: [],
      },
      {
        id: "p3",
        name: "Ice Cream",
        category: "dessert",
        quantity: 1,
        price: 2.99,
        options: [],
      },
    ],
  };

  // 根据订单类型过滤商品
  if (orderType === "drinks") {
    newOrder.products = newOrder.products.filter(
      (p) => p.category === "Drinks"
    );
    console.log("创建饮料订单，商品数量:", newOrder.products.length);
  } else if (orderType === "food") {
    newOrder.products = newOrder.products.filter(
      (p) => p.category === "hot_food" || p.category === "cold_food"
    );
    console.log("创建食物订单，商品数量:", newOrder.products.length);
  }

  return newOrder;
}

// 打印使用说明
function printUsage() {
  console.log("输入命令控制KDS测试程序:");
  console.log("- send: 发送通用测试订单");
  console.log("- send drinks: 发送饮料测试订单");
  console.log("- send food: 发送食物测试订单");
  console.log("- complete [orderId]: 模拟完成订单，发送商品完成状态到主KDS");
  console.log("- status: 显示当前状态");
  console.log("- exit: 退出程序");
}

// 保存最近发送或接收的订单
let lastOrderId = null;
let lastOrderProducts = [];
let connectedClients = new Map(); // 保存连接的客户端

// 根据模式启动不同的服务
if (mode === "master") {
  // 主KDS模式 - 启动服务器
  const server = net.createServer((socket) => {
    const clientKey = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`新客户端连接: ${clientKey}`);
    connectedClients.set(clientKey, socket);

    socket.on("data", (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`收到来自 ${clientKey} 的消息:`, message);

        // 处理注册消息
        if (message.type === "registration") {
          console.log(`收到子KDS注册，分类: ${message.category}`);
          socket.write(
            JSON.stringify({
              type: "registration_ack",
              status: "accepted",
              timestamp: new Date().toISOString(),
            })
          );
        }
        // 处理订单确认
        else if (message.type === "order_ack") {
          console.log(`收到订单确认，订单ID: ${message.orderId}`);
        }
        // 处理商品完成状态
        else if (message.type === "order_items_completed") {
          console.log(`收到商品完成状态，订单ID: ${message.orderId}`);

          // 详细显示完成的商品
          const completedItems = message.completedItems;
          console.log(
            `收到 ${Object.keys(completedItems).length} 个已完成商品状态:`
          );

          for (const itemKey of Object.keys(completedItems)) {
            if (completedItems[itemKey]) {
              // 解析商品索引
              const match = itemKey.match(/(\d+)-item-(\d+)/);
              if (match) {
                const orderIdPart = match[1];
                const itemIndex = parseInt(match[2]);

                // 尝试查找对应的商品信息
                let productName = "未知商品";
                if (lastOrderProducts && lastOrderProducts[itemIndex]) {
                  productName = lastOrderProducts[itemIndex].name;
                }

                console.log(
                  `- 商品 #${itemIndex + 1}: ${productName} (已完成)`
                );
              } else {
                console.log(`- ${itemKey}: 已完成`);
              }
            }
          }

          // 发送确认消息
          socket.write(
            JSON.stringify({
              type: "order_items_completed_ack",
              orderId: message.orderId,
              status: "received",
              timestamp: new Date().toISOString(),
            })
          );

          console.log(`已发送商品完成状态确认`);
        }
      } catch (error) {
        console.error("解析消息失败:", error);
      }
    });

    socket.on("error", (error) => {
      console.error(`客户端 ${clientKey} 连接错误:`, error);
      connectedClients.delete(clientKey);
    });

    socket.on("close", () => {
      console.log(`客户端 ${clientKey} 连接关闭`);
      connectedClients.delete(clientKey);
    });
  });

  server.listen(TCP_PORT, "0.0.0.0", () => {
    console.log(`主KDS服务器启动，监听端口: ${TCP_PORT}`);
    printUsage();
  });

  server.on("error", (error) => {
    console.error("服务器错误:", error);
  });

  // 处理命令行输入 - 主KDS模式
  process.stdin.on("data", (data) => {
    const command = data.toString().trim();

    if (command === "exit") {
      console.log("关闭服务器...");
      server.close();
      process.exit(0);
    } else if (command === "status") {
      console.log(`当前连接的客户端数量: ${connectedClients.size}`);
      connectedClients.forEach((socket, key) => {
        console.log(`- ${key}`);
      });
    } else if (command.startsWith("send")) {
      const parts = command.split(" ");
      const orderType = parts[1] || "";
      const order = createSampleOrder(orderType);

      // 保存最近发送的订单信息
      lastOrderId = order.id;
      lastOrderProducts = order.products;

      // 广播订单到所有连接的客户端
      const orderMessage = JSON.stringify({
        type: "order",
        data: order,
        timestamp: new Date().toISOString(),
      });

      let sentCount = 0;
      connectedClients.forEach((socket, key) => {
        try {
          socket.write(orderMessage);
          sentCount++;
        } catch (error) {
          console.error(`向客户端 ${key} 发送订单失败:`, error);
        }
      });

      console.log(`已向 ${sentCount} 个客户端发送测试订单: ${order.id}`);
    }
  });
} else {
  // 子KDS模式
  const client = new net.Socket();

  client.connect(TCP_PORT, targetIP, () => {
    console.log(`成功连接到主KDS: ${targetIP}:${TCP_PORT}`);

    // 发送注册消息
    client.write(
      JSON.stringify({
        type: "registration",
        role: "slave",
        category: category, // 使用命令行参数指定的分类
        timestamp: new Date().toISOString(),
      })
    );

    printUsage();
  });

  client.on("data", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("收到来自主KDS的消息:", message);

      // 处理订单消息
      if (message.type === "order") {
        console.log(
          `收到新订单 #${message.data.order_num}，订单ID: ${message.data.id}`
        );
        console.log(`订单包含 ${message.data.products.length} 个商品:`);

        // 保存最近收到的订单信息
        lastOrderId = message.data.id;
        lastOrderProducts = message.data.products;

        message.data.products.forEach((product, index) => {
          console.log(
            `  ${index + 1}. ${product.name} (${
              product.category || "未分类"
            }) x${product.quantity}`
          );
        });

        // 检查targetCategory是否与本地分类匹配
        if (message.data.targetCategory) {
          console.log(`订单目标分类: ${message.data.targetCategory}`);
          if (message.data.targetCategory === category || category === "all") {
            console.log(`✓ 分类匹配，应显示此订单`);
          } else {
            console.log(`✗ 分类不匹配，应过滤此订单`);
          }
        }

        // 发送订单确认
        client.write(
          JSON.stringify({
            type: "order_ack",
            orderId: message.data.id,
            status: "received",
            timestamp: new Date().toISOString(),
          })
        );

        console.log(`已发送订单确认到主KDS`);
      }
      // 处理商品完成状态确认消息
      else if (message.type === "order_items_completed_ack") {
        console.log(`收到商品完成状态确认，订单ID: ${message.orderId}`);
        console.log(`状态: ${message.status}`);
      }
      // 处理商品完成状态消息（当作为主KDS模拟器时）
      else if (message.type === "order_items_completed") {
        console.log(`收到商品完成状态，订单ID: ${message.orderId}`);
        console.log("完成的商品:", message.completedItems);

        // 发送确认消息
        client.write(
          JSON.stringify({
            type: "order_items_completed_ack",
            orderId: message.orderId,
            status: "received",
            timestamp: new Date().toISOString(),
          })
        );

        console.log(`已发送商品完成状态确认`);
      }
    } catch (error) {
      console.error("解析消息失败:", error);
    }
  });

  client.on("error", (error) => {
    console.error("连接错误:", error);
  });

  client.on("close", () => {
    console.log("连接已关闭");
  });

  // 处理命令行输入 - 子KDS模式
  process.stdin.on("data", (data) => {
    const command = data.toString().trim();

    if (command === "exit") {
      console.log("关闭连接...");
      client.destroy();
      process.exit(0);
    } else if (command === "status") {
      console.log(`当前模式: ${mode}`);
      console.log(`连接到主KDS: ${targetIP}:${TCP_PORT}`);
      console.log(`分类: ${category}`);
      console.log(`最近订单ID: ${lastOrderId || "无"}`);
    } else if (command.startsWith("send")) {
      const parts = command.split(" ");
      const orderType = parts[1] || "";
      const order = createSampleOrder(orderType);

      // 保存最近发送的订单信息
      lastOrderId = order.id;
      lastOrderProducts = order.products;

      client.write(
        JSON.stringify({
          type: "order",
          data: order,
          timestamp: new Date().toISOString(),
        })
      );
      console.log(`已发送测试订单到主KDS: ${order.id}`);
    } else if (command.startsWith("complete")) {
      // 处理完成订单命令
      const parts = command.split(" ");
      const orderId = parts[1] || lastOrderId;

      if (!orderId) {
        console.log("错误: 没有指定订单ID，也没有最近处理的订单");
        return;
      }

      // 创建商品完成状态对象
      const completedItems = {};

      // 如果有最近的订单商品，使用它们的ID
      if (lastOrderProducts && lastOrderProducts.length > 0) {
        lastOrderProducts.forEach((product, index) => {
          const itemKey = `${orderId}-item-${index}`;
          completedItems[itemKey] = true;
        });

        console.log(
          `为订单 ${orderId} 创建了 ${
            Object.keys(completedItems).length
          } 个已完成商品状态`
        );
      } else {
        // 创建一些默认的完成状态
        completedItems[`${orderId}-item-0`] = true;
        completedItems[`${orderId}-item-1`] = true;
        console.log(`为订单 ${orderId} 创建了 2 个默认已完成商品状态`);
      }

      // 检查是否有匹配的商品被标记为完成
      if (Object.keys(completedItems).length === 0) {
        console.log("没有匹配的商品被标记为完成，不发送状态更新");
        return;
      }

      // 发送商品完成状态到主KDS
      client.write(
        JSON.stringify({
          type: "order_items_completed",
          orderId: orderId,
          completedItems: completedItems,
          timestamp: new Date().toISOString(),
        })
      );
      console.log(`已发送订单 ${orderId} 的商品完成状态到主KDS`);
      console.log("完成状态:", completedItems);
    }
  });
}
