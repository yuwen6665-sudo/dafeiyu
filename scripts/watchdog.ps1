# 看门狗：每 5 分钟检查一次，DSH 换了端口就更新 qq-bridge，进程挂了就拉起来
#
# 注册计划任务（静默、不弹窗）：
#   schtasks /Create /TN "YuSheng-Watchdog" /SC MINUTE /MO 5 /TR "wscript.exe \"E:\QQ-Bot\watch-hidden.vbs\"" /F
#
# 其中 watch-hidden.vbs 内容：
#   Set sh = CreateObject("WScript.Shell")
#   sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""E:\QQ-Bot\watchdog.ps1""", 0, False

$ErrorActionPreference = 'Continue'
$log = 'E:\QQ-Bot\watchdog.log'
function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8 }

$BOT_ROOT = 'E:\QQ-Bot'
$cfgPath  = "$BOT_ROOT\qq-bridge\config.json"

# 1. 找 DSH 端口（它每次启动会变）
$dsh = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -ge 50000 -and $_.LocalPort -le 65000 } |
    Sort-Object LocalPort | Select-Object -First 1

if (-not $dsh) { Log 'DSH 不在运行，跳过'; exit }

$newUrl = "http://127.0.0.1:$($dsh.LocalPort)"
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($cfg.dsh.baseUrl -ne $newUrl) {
    Log "DSH 端口变化：$($cfg.dsh.baseUrl) -> $newUrl，更新并重启桥接"
    $cfg.dsh.baseUrl = $newUrl
    $cfg | ConvertTo-Json -Depth 10 | Set-Content $cfgPath -Encoding UTF8

    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -like '*bridge.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Start-Process -FilePath (Get-Command node).Source -ArgumentList "$BOT_ROOT\qq-bridge\src\bridge.js" `
        -WorkingDirectory "$BOT_ROOT\qq-bridge" -WindowStyle Hidden
    Log '桥接已重启'
}

# 2. SnowLuma 掉了就拉
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
    Log 'SnowLuma 不在，拉起…'
    if (Test-Path "$BOT_ROOT\SnowLuma\launcher.bat") {
        Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$BOT_ROOT\SnowLuma\launcher.bat`"" -WindowStyle Hidden
    }
}
