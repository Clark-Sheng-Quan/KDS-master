const net = require('net');

// TCP Server configuration
const TCP_HOST = '192.168.0.173'; // Remote device
const TCP_PORT = 8080;

// Test POS order payload
const testOrder = {
  type: 'POS',
  orderType: 'POS',
  id: `ORDER-${Date.now()}`, // Unique order ID
  orderTime: new Date().toISOString(),
  tableName: 'Table 1',
  customerName: 'Test Customer',
  orderitems: [
    {
      id: 'item-1',
      name: '红烧肉',
      category: 'Meat',
      qty: 2,
      instruction: 'Not spicy',
      price: 28.0
    },
    {
      id: 'item-2',
      name: '清蒸鱼',
      category: 'Fish',
      qty: 1,
      instruction: '',
      price: 32.0
    },
    {
      id: 'item-3',
      name: '番茄鸡蛋汤',
      category: 'Soup',
      qty: 1,
      instruction: '',
      price: 12.0
    }
  ],
  notes: 'Test order from TCP client',
  totalPrice: 100.0
};

// Convert order to JSON and calculate content length
const jsonBody = JSON.stringify(testOrder);
const contentLength = Buffer.byteLength(jsonBody, 'utf8');

// Build HTTP request
const httpRequest = 
  'POST / HTTP/1.1\r\n' +
  `Host: ${TCP_HOST}:${TCP_PORT}\r\n` +
  'Content-Type: application/json\r\n' +
  `Content-Length: ${contentLength}\r\n` +
  'Connection: keep-alive\r\n' +
  '\r\n' +
  jsonBody;

console.log('=====================================');
console.log('TCP ORDER TEST CLIENT');
console.log('=====================================');
console.log(`Connecting to TCP Server: ${TCP_HOST}:${TCP_PORT}`);
console.log(`Order ID: ${testOrder.id}`);
console.log(`Order Items: ${testOrder.orderitems.length} items`);
console.log('=====================================\n');

// Create TCP connection
const socket = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
  console.log('✓ Connected to server');
  console.log('📤 Sending test order...\n');
  
  // Send HTTP request
  socket.write(httpRequest);
  
  // Log request details
  console.log('Request Headers:');
  console.log(`  Content-Length: ${contentLength} bytes`);
  console.log(`  Content-Type: application/json\n`);
  
  console.log('Request Body:');
  console.log(JSON.stringify(testOrder, null, 2));
  console.log('\n');
});

// Handle response
socket.on('data', (data) => {
  const response = data.toString('utf8');
  console.log('📥 Received Response:');
  console.log(response);
  console.log('✓ Test completed successfully!\n');
  socket.end();
});

// Handle errors
socket.on('error', (error) => {
  console.error('✗ Connection error:', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.error('\n❌ Could not connect to TCP server on port 8080.');
    console.error('Make sure:');
    console.error('  1. The KDS app is running');
    console.error('  2. TCP server has been started');
    console.error('  3. Port 8080 is not blocked');
  }
  process.exit(1);
});

// Handle socket close
socket.on('close', () => {
  console.log('Connection closed');
});

// Handle socket end
socket.on('end', () => {
  console.log('=====================================');
  process.exit(0);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('✗ No response from server after 5 seconds');
  socket.destroy();
  process.exit(1);
}, 5000);
