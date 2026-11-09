# 桌面宿主

让于笙"活在桌面上"的那一层。技术栈：**Electron 透明窗口 + 三个 C# 小工具**。

## 为什么不用系统壁纸层（WorkerW）

我们试过，而且挂上去了——但 **Chromium 系窗口一旦成为 WorkerW 的子窗口，内部视口就不跟着走**：

| 宿主 | 窗口 Win32 尺寸 | 页面实际视口 |
|---|---|---|
| WebView2 | 2560×1600 | 580×127 |
| Edge 窗口 | 2560×1600 | 580×127 |
| Electron | 2560×1600 | ~640×110 |

页面只画左上角一小块，剩下全黑。这是 Chromium 对特殊父窗口的硬限制（PerMonitorV2 清单、
延后创建、Win32 强改、app.disableHardwareAcceleration 都试过，均无效）。

所以最终方案是**「透明窗口 + 动态点击穿透 + z-order 控制」**，和主流桌面宠物（含开源项目
xiaokeai / DesktopGirls）做法一致。

## 这三个小工具

| 工具 | 作用 |
|---|---|
| `attach.exe <标题>` | 把窗口挂到壁纸层（WorkerW）。**仅保留作实验/研究**，正式不用 |
| `bottom.exe <标题>` | 把窗口压到 z-order 最底层（不改变层级归属） |
| `watcher.exe <标题>` | 主控：每 30ms 判断前台是不是桌面；是→提到最上层，否→沉到底层；同时按 `pet-bounds.json` 动态开关点击穿透 |

`pet-bounds.json` 由页面每 120ms 上报（`window.yusheng.bounds()`），内容是她在页面里的
CSS 坐标 + dpr；watcher 用 `GetCursorPos` 对比，鼠标落在她身上就去掉 `WS_EX_TRANSPARENT`。

## 快捷键

| 快捷键 | 作用 |
|---|---|
| `Ctrl + Alt + H` | 隐藏 / 显示（手动，与全屏自动隐藏互相独立） |
| `Ctrl + Alt + 1 / 2 / 3` | 缩放 80% / 100% / 125% |
| `Ctrl + Alt + Y` | 临时切换置顶 |

位置、缩放、隐藏状态保存在 `pet-prefs.json`，重启自动恢复。

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

## 启动

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
.\electron\electron.exe
```

## 踩过的坑

1. **`ELECTRON_RUN_AS_NODE=1`**：如果环境里设了（SnowLuma 会设），Electron 会当 Node 跑，直接退出
2. **透明窗口整屏变白**：`focusable:false` + `showInactive()` 组合导致。改回 `show()` + `focusable:true` 正常
3. **透明窗口里 `<video>` 失去 alpha**：改成逐帧 `drawImage` 到 canvas
4. **Win+D 会把她一起最小化**：监听 `minimize` 立刻 `restore`
5. **DPI**：截图/模拟点击的进程要 `SetProcessDpiAwarenessContext(-4)`，否则坐标全错

## 已知未完成

- 目前点击穿透的开关在部分机器上不生效（表现为"看得到但点不到"）
- 计划改成"小窗口跟随"方案：窗口只有她那么大、永远可点，代价是那块区域挡住桌面图标
