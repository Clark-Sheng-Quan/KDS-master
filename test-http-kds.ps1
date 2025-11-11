# PowerShell script to test KDS HTTP-only protocol with persistent connections

$KDS_IP = "192.168.0.156"
$KDS_PORT = 4322

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KDS HTTP Persistent Connection Test" -ForegroundColor Cyan
Write-Host "Testing KDS at: $KDS_IP`:$KDS_PORT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Add-Type -AssemblyName System.Net.Http

function Send-HttpRequest {
    param(
        [System.Net.Sockets.TcpClient]$client,
        [System.IO.StreamWriter]$writer,
        [System.IO.StreamReader]$reader,
        [string]$body,
        [string]$testName
    )
    
    Write-Host "[$testName] Sending request..." -ForegroundColor Yellow

    $contentLength = [System.Text.Encoding]::UTF8.GetByteCount($body)
    $httpRequest = @"
POST / HTTP/1.1
Host: $KDS_IP`:$KDS_PORT
Content-Type: application/json
Content-Length: $contentLength
Connection: keep-alive

$body
"@
    
    try {
        # 发送请求
        $writer.Write($httpRequest)
        $writer.Flush()
        
        # 读取响应
        $statusLine = $reader.ReadLine()
        Write-Host "  Status: $statusLine" -ForegroundColor Gray
        
        # 读取响应头
        $headers = @{}
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            
            $parts = $line -split ':', 2
            if ($parts.Length -eq 2) {
                $headers[$parts[0].Trim()] = $parts[1].Trim()
            }
        }
        
        # 检查 Connection 头
        if ($headers.ContainsKey('Connection')) {
            $connectionHeader = $headers['Connection']
            if ($connectionHeader -eq 'keep-alive') {
                Write-Host "  Connection: keep-alive (persistent)" -ForegroundColor Green
            } else {
                Write-Host "  Connection: $connectionHeader" -ForegroundColor Yellow
            }
        }
        
        # 读取响应体
        $contentLength = 0
        if ($headers.ContainsKey('Content-Length')) {
            $contentLength = [int]$headers['Content-Length']
        }
        
        if ($contentLength -gt 0) {
            $buffer = New-Object char[] $contentLength
            $bytesRead = $reader.Read($buffer, 0, $contentLength)
            $responseBody = -join $buffer[0..($bytesRead-1)]
            Write-Host "  Response: $responseBody" -ForegroundColor Gray
        }
        
        Write-Host "  Success!" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Host "  Failed: $_" -ForegroundColor Red
        return $false
    }
}

Write-Host "[CONNECTION] Establishing persistent TCP connection..." -ForegroundColor Cyan

try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect($KDS_IP, $KDS_PORT)
    
    $stream = $tcpClient.GetStream()
    $writer = New-Object System.IO.StreamWriter($stream)
    $writer.AutoFlush = $false
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "[CONNECTION] Connected! Starting tests on same connection..." -ForegroundColor Green
    Write-Host ""
    
    Start-Sleep -Milliseconds 500
    
    # Test 1: Registration
    $registrationBody = @{
        type = "registration"
        deviceId = "POS-001"
        deviceName = "Main POS System"
    } | ConvertTo-Json -Compress
    
    $success = Send-HttpRequest -client $tcpClient -writer $writer -reader $reader -body $registrationBody -testName "TEST 1 - Registration"
    Write-Host ""
    Start-Sleep -Seconds 1
    
    # Test 2: Heartbeat
    # $heartbeatBody = @{
    #     type = "heartbeat"
    #     timestamp = (Get-Date -Format "o")
    # } | ConvertTo-Json -Compress
    
    # $success = Send-HttpRequest -client $tcpClient -writer $writer -reader $reader -body $heartbeatBody -testName "TEST 2 - Heartbeat"
    # Write-Host ""
    # Start-Sleep -Seconds 1
    
    # Test 3: Real POS Order (from actual system with full product details)
    $realOrderBody = '{
        "PickMethod": {},
        "createdAt": "Nov 10, 2025 10:47:00 PM",
        "id": "a086cc75-1b75-443d-a73b-a8049a294c08",
        "member": {},
        "modifiedTotalCost": {},
        "notes": "",
        "orderNumber": {},
        "orderType": "POS",
        "orderitems": [
            {
            "id": "85ec9786-a780-4dcb-bf90-b70572bf0255",
            "itemState": "PROCESSED",
            "orderItems": [],
            "isValidKds": true,
            "product": {
                "active": true,
                "calories": 0,
                "category": ["Food"],
                "description": "",
                "image_url": [],
                "name": "White Peach Milk Tea",
                "options": {},
                "price": 6.0,
                "pricing_unit": "quantity",
                "product_id": "68e89e0f9ea6af82724cbd00",
                "sku": "2405141011117",
                "tax_required": true
            },
            "qty": 1
            },
            {
            "id": "4bff1602-8582-46a6-9242-faaeb58a0053",
            "itemState": "VOIDED",
            "orderItems": [],
            "isValidKds": true,
            "product": {
                "active": true,
                "calories": 0,
                "category": ["Milk Tea"],
                "description": "",
                "image_url": [],
                "name": "Osmanthus Milk Tea",
                "options": {},
                "price": 6.0,
                "pricing_unit": "quantity",
                "product_id": "68e89d759ea6af82724cbcfe",
                "sku": "2405141015124",
                "tax_required": true
            },
            "qty": 1
            }
        ],
        "ordermode": "DINEIN",
        "paymentDetails": {
            "TransactionID": {},
            "cardAmount": 0.0,
            "cashAmount": 0.0,
            "isPaid": false,
            "totalAmount": 0.0
        },
        "status": "IN_PROGRESS",
        "tableNumber": {},
        "tableOrder": {},
        "tableSize": 1,
        "userID": {}
        }';
    $success = Send-HttpRequest -client $tcpClient -writer $writer -reader $reader -body $realOrderBody -testName "TEST 2 - Real POS Order (2 items)"
    Write-Host ""
    Start-Sleep -Seconds 1
    
    if ($tcpClient.Connected) {
        Write-Host "[CONNECTION] Connection still active!" -ForegroundColor Green
    } else {
        Write-Host "[CONNECTION] Connection closed!" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Waiting for commands..." -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  o - Send new order" -ForegroundColor Yellow
    Write-Host "  q  - Disconnect and exit" -ForegroundColor Yellow
    Write-Host ""
    
    $keepConnection = $true
    while ($keepConnection -and $tcpClient.Connected) {
        Write-Host ""
        $command = Read-Host "Enter command"
        $command = $command.ToLower().Trim()
        
        if ($command -eq 'q') {
            Write-Host "[CONNECTION] Disconnecting..." -ForegroundColor Cyan
            $keepConnection = $false
        } elseif ($command -eq 'o') {
            Write-Host "[ORDER] Sending order..." -ForegroundColor Cyan
            
            $success = Send-HttpRequest -client $tcpClient -writer $writer -reader $reader -body $realOrderBody -testName "Order"
        } else {
            Write-Host "Unknown command: $command" -ForegroundColor Red
            Write-Host "Use 'order' or 'quit'" -ForegroundColor Yellow
        }
    }
    
} catch {
    Write-Host "[ERROR] Connection failed: $_" -ForegroundColor Red
} finally {
    if ($reader) { $reader.Close() }
    if ($writer) { $writer.Close() }
    if ($stream) { $stream.Close() }
    if ($tcpClient) { $tcpClient.Close() }
    Write-Host ""
    Write-Host "[CLEANUP] Connection closed" -ForegroundColor Cyan
}

