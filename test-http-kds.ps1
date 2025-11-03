# PowerShell script to test KDS HTTP-only protocol

$KDS_IP = "192.168.0.156"
$KDS_PORT = 4322

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KDS HTTP-Only Protocol Test Script" -ForegroundColor Cyan
Write-Host "Testing KDS at: $KDS_IP`:$KDS_PORT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Registration
Write-Host "[TEST 1] Testing Registration..." -ForegroundColor Yellow
$registrationBody = @{
    type = "registration"
    deviceId = "POS-001"
    deviceName = "Main POS System"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://$KDS_IP`:$KDS_PORT" -Method Post -Body $registrationBody -ContentType "application/json"
    Write-Host "Success: Registration successful!" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "Failed: Registration failed!" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Test 2: Heartbeat
Write-Host ""
Write-Host "[TEST 2] Testing Heartbeat..." -ForegroundColor Yellow
$heartbeatBody = @{
    type = "heartbeat"
    timestamp = (Get-Date -Format "o")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://$KDS_IP`:$KDS_PORT" -Method Post -Body $heartbeatBody -ContentType "application/json"
    Write-Host "Success: Heartbeat successful!" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "Failed: Heartbeat failed!" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Test 3: Order with standard format
Write-Host ""
Write-Host "[TEST 3] Testing Order with standard format..." -ForegroundColor Yellow
$orderBody = @{
    type = "order"
    data = @{
        id = "ORD-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        orderNumber = "123"
        timestamp = (Get-Date -Format "o")
        products = @(
            @{
                id = "PROD-001"
                name = "Burger"
                quantity = 2
                notes = "No onions"
            },
            @{
                id = "PROD-002"
                name = "Fries"
                quantity = 1
                notes = ""
            }
        )
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://$KDS_IP`:$KDS_PORT" -Method Post -Body $orderBody -ContentType "application/json"
    Write-Host "Success: Standard order successful!" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "Failed: Standard order failed!" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Test 4: POS Order format
Write-Host ""
Write-Host "[TEST 4] Testing POS Order format..." -ForegroundColor Yellow
$posOrderBody = @{
    id = "POS-ORD-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    orderType = "POS"
    orderNumber = "456"
    timestamp = (Get-Date -Format "o")
    orderitems = @(
        @{
            id = "ITEM-001"
            name = "Pizza"
            quantity = 1
            notes = "Extra cheese"
        },
        @{
            id = "ITEM-002"
            name = "Soda"
            quantity = 2
            notes = ""
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://$KDS_IP`:$KDS_PORT" -Method Post -Body $posOrderBody -ContentType "application/json"
    Write-Host "Success: POS Order successful!" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "Failed: POS Order failed!" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All tests completed!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
