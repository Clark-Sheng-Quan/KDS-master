# PowerShell Script - Test TCP Orders to KDS System
# Usage: .\test_tcp_order.ps1

# KDS TCP Server Configuration
$ServerIP = "192.168.0.156"  # Your KDS IP address
$ServerPort = 4322           # Your TCP port

# Test Order 1 - Contains VOIDED item
$order1 = @'
{"PickMethod":{},"createdAt":"Oct 30, 2025 10:44:43 PM","id":"fe5e9b6c-23cc-4b22-b67a-77ed2bdd0b49","modifiedTotalCost":{},"notes":"","orderNumber":{},"orderType":"POS","orderitems":[{"id":"0ba217c3-e9de-4152-baef-9a818974c94d","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Milk Tea"],"description":"","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/products/GoldenSenchaMilkTea1760074553.jpeg"],"name":"Golden Sencha Milk Tea","options":[],"price":6.0,"pricing_unit":"quantity","product_id":"68e89b399ea6af82724cbcfc","sku":"240514101113","tax_required":true},"qty":1},{"id":"e0f3e24b-c3d2-405d-bc2b-ac6a00ebe378","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Milk Tea"],"description":"","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/products/StickyRiceTea1760075432.jpeg"],"name":"Sticky Rice Tea","options":[],"price":6.9,"pricing_unit":"quantity","product_id":"68e4959412a465ffa6ad1763","sku":"2405141011111","tax_required":true},"qty":1},{"id":"4dc2ba55-6c69-4f09-9a28-7f41b11356d0","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Ramen"],"description":"Tonkotsu ramen","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/uploads/TonkotsuRamen1722999507.jpeg"],"name":"Tonkotsu Ramen","options":[],"price":21.0,"pricing_unit":"quantity","product_id":"66b2e2a628f334f17a0e386f","sku":"asf123Sku","tax_required":true},"qty":1},{"id":"a4deda49-2e72-41c5-95be-0e8e3269c61a","itemState":"VOIDED","orderItems":[],"product":{"active":true,"calories":0,"category":["Bento"],"description":"Sushi Bento Box","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/uploads/3CourseSushiMeal1733886762.png"],"name":"3 Course Sushi Meal","options":[],"price":13.0,"pricing_unit":"quantity","product_id":"675902f34e454c2a96a0c193","sku":"3Course Shushi","tax_required":true},"qty":1}],"ordermode":"DINEIN","paymentDetails":{"TransactionID":{},"cardAmount":0.0,"cashAmount":0.0,"isPaid":false,"totalAmount":0.0},"status":"IN_PROGRESS","tableNumber":{},"tableOrder":{},"tableSize":1,"userID":{}}
'@

# Test Order 2 - For testing update (same ID)
$order2_update = @'
{"PickMethod":{},"createdAt":"Oct 30, 2025 10:44:43 PM","id":"fe5e9b6c-23cc-4b22-b67a-77ed2bdd0b49","modifiedTotalCost":{},"notes":"UPDATED ORDER","orderNumber":{},"orderType":"POS","orderitems":[{"id":"0ba217c3-e9de-4152-baef-9a818974c94d","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Milk Tea"],"description":"","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/products/GoldenSenchaMilkTea1760074553.jpeg"],"name":"Golden Sencha Milk Tea","options":[],"price":6.0,"pricing_unit":"quantity","product_id":"68e89b399ea6af82724cbcfc","sku":"240514101113","tax_required":true},"qty":2},{"id":"e0f3e24b-c3d2-405d-bc2b-ac6a00ebe378","itemState":"VOIDED","orderItems":[],"product":{"active":true,"calories":0,"category":["Milk Tea"],"description":"","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/products/StickyRiceTea1760075432.jpeg"],"name":"Sticky Rice Tea","options":[],"price":6.9,"pricing_unit":"quantity","product_id":"68e4959412a465ffa6ad1763","sku":"2405141011111","tax_required":true},"qty":1},{"id":"4dc2ba55-6c69-4f09-9a28-7f41b11356d0","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Ramen"],"description":"Tonkotsu ramen","image_url":["https://vendsysimg.s3.ap-southeast-2.amazonaws.com/uploads/TonkotsuRamen1722999507.jpeg"],"name":"Tonkotsu Ramen","options":[],"price":21.0,"pricing_unit":"quantity","product_id":"66b2e2a628f334f17a0e386f","sku":"asf123Sku","tax_required":true},"qty":1}],"ordermode":"DINEIN","paymentDetails":{"TransactionID":{},"cardAmount":0.0,"cashAmount":0.0,"isPaid":false,"totalAmount":0.0},"status":"IN_PROGRESS","tableNumber":{},"tableOrder":{},"tableSize":1,"userID":{}}
'@

# Test Order 3 - New order
$order3_new = @'
{"PickMethod":{},"createdAt":"Oct 31, 2025 11:30:00 AM","id":"abc123-new-order-test","modifiedTotalCost":{},"notes":"","orderNumber":{},"orderType":"POS","orderitems":[{"id":"item-001","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Pizza"],"description":"","image_url":[],"name":"Margherita Pizza","options":[],"price":15.0,"pricing_unit":"quantity","product_id":"pizza-001","sku":"PIZZA-MAR","tax_required":true},"qty":2},{"id":"item-002","itemState":"PROCESSED","orderItems":[],"product":{"active":true,"calories":0,"category":["Drinks"],"description":"","image_url":[],"name":"Coca Cola","options":[],"price":3.5,"pricing_unit":"quantity","product_id":"drink-001","sku":"COKE","tax_required":true},"qty":1}],"ordermode":"TAKEAWAY","paymentDetails":{"TransactionID":{},"cardAmount":0.0,"cashAmount":0.0,"isPaid":false,"totalAmount":0.0},"status":"IN_PROGRESS","tableNumber":{},"tableOrder":{},"tableSize":1,"userID":{}}
'@

function Send-TCPOrder {
    param(
        [string]$ServerIP,
        [int]$ServerPort,
        [string]$JsonData,
        [string]$OrderName
    )
    
    try {
        Write-Host "`n========================================" -ForegroundColor Cyan
        Write-Host "Sending Order: $OrderName" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Cyan
        
        # Create TCP client
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($ServerIP, $ServerPort)
        Write-Host "Connected to ${ServerIP}:${ServerPort}" -ForegroundColor Green
        
        # Get network stream
        $stream = $client.GetStream()
        
        # Calculate JSON byte length (UTF-8 encoding)
        $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($JsonData)
        $contentLength = $jsonBytes.Length
        
        # Build standard TCP message format: Content-Length: {bytes}\r\n\r\n{json}
        $header = "Content-Length: $contentLength`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
        
        # Merge header and JSON
        $fullMessage = $headerBytes + $jsonBytes
        
        Write-Host "Order size: $contentLength bytes" -ForegroundColor Gray
        Write-Host "Sending message..." -ForegroundColor Gray
        
        # Send data
        $stream.Write($fullMessage, 0, $fullMessage.Length)
        $stream.Flush()
        
        Write-Host "Order sent successfully!" -ForegroundColor Green
        
        # Wait and read response (optional)
        Start-Sleep -Milliseconds 500
        if ($stream.DataAvailable) {
            $buffer = New-Object byte[] 1024
            $bytesRead = $stream.Read($buffer, 0, 1024)
            $response = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
            Write-Host "Server response: $response" -ForegroundColor Magenta
        }
        
        # Close connection
        $stream.Close()
        $client.Close()
        
    } catch {
        Write-Host "Send failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Main Menu
Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   KDS TCP Order Test Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server: $ServerIP : $ServerPort" -ForegroundColor Yellow
Write-Host ""
Write-Host "Select test scenario:" -ForegroundColor White
Write-Host "  1. Send new order (with 1 VOIDED item)" -ForegroundColor White
Write-Host "  2. Send order update (same ID, test UPDATED badge)" -ForegroundColor White
Write-Host "  3. Send another new order (different ID)" -ForegroundColor White
Write-Host "  4. Send all 3 orders (test continuous sending)" -ForegroundColor White
Write-Host "  5. Update same order 3 times (test UPDATED 2, 3)" -ForegroundColor White
Write-Host "  0. Exit" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Enter your choice (0-5)"

switch ($choice) {
    "1" {
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order1 -OrderName "Order 1 (New Order)"
    }
    "2" {
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order2_update -OrderName "Order 1 Updated (Test Update)"
    }
    "3" {
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order3_new -OrderName "Order 3 (New Order)"
    }
    "4" {
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order1 -OrderName "Order 1 (New)"
        Start-Sleep -Seconds 2
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order2_update -OrderName "Order 1 Updated"
        Start-Sleep -Seconds 2
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order3_new -OrderName "Order 3 (New)"
    }
    "5" {
        Write-Host "`nTesting continuous updates..." -ForegroundColor Yellow
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order1 -OrderName "Order 1 (First)"
        Start-Sleep -Seconds 3
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order2_update -OrderName "Order 1 (Update 1 - should show UPDATED)"
        Start-Sleep -Seconds 3
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order2_update -OrderName "Order 1 (Update 2 - should show UPDATED 2)"
        Start-Sleep -Seconds 3
        Send-TCPOrder -ServerIP $ServerIP -ServerPort $ServerPort -JsonData $order2_update -OrderName "Order 1 (Update 3 - should show UPDATED 3)"
    }
    "0" {
        Write-Host "`nGoodbye!" -ForegroundColor Green
        exit
    }
    default {
        Write-Host "`nInvalid choice!" -ForegroundColor Red
    }
}

Write-Host "`nPress any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
