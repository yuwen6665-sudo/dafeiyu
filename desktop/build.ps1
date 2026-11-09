# 于笙 · 桌面宿主（Electron）
#
# 用法：
#   1) 下载 Electron 预编译包，解压到本目录下的 electron/
#      https://npmmirror.com/mirrors/electron/33.4.11/electron-v33.4.11-win32-x64.zip
#   2) powershell -ExecutionPolicy Bypass -File .\build.ps1
#   3) 启动 electron\electron.exe
#
# 说明见同目录 README.md

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$electron = Join-Path $root 'electron'
$appDir = Join-Path $electron 'resources\app'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path $csc)) { throw "找不到 csc.exe：$csc" }
if (-not (Test-Path (Join-Path $electron 'electron.exe'))) {
    Write-Warning "electron/ 里没有 electron.exe"
    Write-Host "请先下载并解压："
    Write-Host "  https://npmmirror.com/mirrors/electron/33.4.11/electron-v33.4.11-win32-x64.zip"
    Write-Host "解压到：$electron"
    exit 1
}

New-Item -ItemType Directory -Force -Path $appDir | Out-Null

Write-Host '[1/3] 编译 attach.exe / bottom.exe / watcher.exe / fullscreen.exe'
foreach ($name in @('attach', 'bottom', 'watcher', 'fullscreen', 'cursorwatch')) {
    & $csc /nologo /target:exe /platform:x64 /optimize+ `
        "/out:$appDir\$name.exe" (Join-Path $root "src\$name.cs")
    if ($LASTEXITCODE -ne 0) { throw "编译 $name.cs 失败" }
}

Write-Host '[2/3] 复制前端 APP'
Copy-Item (Join-Path $root 'app\main.js') $appDir -Force
Copy-Item (Join-Path $root 'app\preload.js') $appDir -Force
@'
{
  "name": "yusheng-desktop",
  "version": "0.1.0",
  "main": "main.js"
}
'@ | Set-Content -Path (Join-Path $appDir 'package.json') -Encoding UTF8

Write-Host '[3/3] 完成'
Write-Host "启动： $electron\electron.exe"
Write-Host "注意：启动前确保环境里没有 ELECTRON_RUN_AS_NODE"
