# 于笙 · 一键启动（Windows）
#
# 顺序：QQ → DSH → SnowLuma → qq-bridge → 于笙服务(yuyaya) → 语音侧车
# 用法：powershell -ExecutionPolicy Bypass -File .\start-all.ps1

$ErrorActionPreference = 'Continue'
$log = 'E:\QQ-Bot\autostart.log'
function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'MM-dd HH:mm:ss'), $m) -Encoding UTF8 }

$BOT_ROOT   = 'E:\QQ-Bot'
$QQ_EXE     = 'C:\Program Files\Tencent\QQNT\QQ.exe'          # 改成你的 QQ 路径
$SNOWLUMA   = "$BOT_ROOT\SnowLuma"
$BRIDGE     = "$BOT_ROOT\qq-bridge"
$YUYAYA     = "$BOT_ROOT\yuyaya"
$DESKTOP    = "$BOT_ROOT\yuyaya-desktop\electron"

Log '===== 自启开始 ====='

# 1. QQ
if (-not (Get-Process QQ -ErrorAction SilentlyContinue)) {
    if (Test-Path $QQ_EXE) { Start-Process $QQ_EXE; Log '启动 QQ' } else { Log "找不到 QQ: $QQ_EXE" }
}

# 2. DSH（DeepSeek Harness 桌面端，需要手动或由它自己的开机项拉起）
$dsh = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -ge 50000 -and $_.LocalPort -le 65000 } | Select-Object -First 1
if (-not $dsh) { Log 'DSH 似乎没在运行（请确认 DeepSeek Harness 已启动）' }

# 3. SnowLuma
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
    if (Test-Path "$SNOWLUMA\launcher.bat") {
        Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$SNOWLUMA\launcher.bat`"" -WindowStyle Hidden
        Log '启动 SnowLuma'
    } else { Log "找不到 SnowLuma launcher: $SNOWLUMA\launcher.bat" }
}

# 4. qq-bridge
Start-Sleep -Seconds 8
$bridgeRunning = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*bridge.js*' }
if (-not $bridgeRunning -and (Test-Path "$BRIDGE\src\bridge.js")) {
    Start-Process -FilePath (Get-Command node).Source -ArgumentList "$BRIDGE\src\bridge.js" `
        -WorkingDirectory $BRIDGE -WindowStyle Hidden
    Log '启动 qq-bridge'
}

# 5. 于笙服务（yuyaya）
if (-not (Get-NetTCPConnection -LocalPort 8848 -State Listen -ErrorAction SilentlyContinue) -and (Test-Path "$YUYAYA\server")) {
    Start-Process -FilePath 'python' -ArgumentList '-m', 'server' -WorkingDirectory $YUYAYA `
        -WindowStyle Hidden -RedirectStandardOutput "$BOT_ROOT\yuyaya-server.log" `
        -RedirectStandardError "$BOT_ROOT\yuyaya-server.err"
    Log '启动 于笙服务 :8848'
}

# 6. 语音侧车
$sidecar = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*voice-sidecar.ps1*' }
if (-not $sidecar) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden', '-File', "$BOT_ROOT\voice-sidecar.ps1" -WindowStyle Hidden
    Log '启动 语音侧车'
}

# 7. 桌面挂件
$a = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue
if (-not $a -and (Test-Path "$DESKTOP\electron.exe")) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "$DESKTOP\electron.exe"
    $psi.WorkingDirectory = $DESKTOP
    $psi.UseShellExecute = $false
    [void][System.Diagnostics.Process]::Start($psi)
    Log '启动 桌面挂件'
}

Log '===== 自启完成 ====='
