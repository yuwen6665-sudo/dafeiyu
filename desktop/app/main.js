// 于笙桌面挂件（透明置顶窗）
// 参考「桌面女友」类开源项目的做法：透明窗口 + 点击穿透 + 置顶，而不是去改系统壁纸层
const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require("electron");
const path = require("path");

const URL = process.env.YUSHENG_URL || "http://127.0.0.1:8848/pet.html?pet=1";

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-transparent-visuals");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("remote-debugging-port", "9224");



function log(msg) {
  try {
    require("fs").appendFileSync(path.join(__dirname, "overlay.log"),
      new Date().toISOString() + " " + msg + "\n");
  } catch (e) {}
}

function createWindow() {
  const b = screen.getPrimaryDisplay().bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  win.setAlwaysOnTop(false);

  win.setTitle("于笙的桌面");
  // 点击穿透交给 watcher.exe 按光标位置动态开关（比 setIgnoreMouseEvents 稳）
  const fs = require("fs");
  const boundsFile = path.join(__dirname, "pet-bounds.json");
  ipcMain.on("bounds", (_e, b) => { try { fs.writeFileSync(boundsFile, JSON.stringify(b)); } catch (err) {} });
  win.loadURL(URL);
  win.once("ready-to-show", () => {
    win.show();
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    log("overlay ready " + b.width + "x" + b.height + " url=" + win.webContents.getURL());
    // 压到最底层：她活在桌面上，打开其他窗口就被盖住（桌面女友同类做法）
    const bottom = path.join(__dirname, "bottom.exe");
    const { execFile } = require("child_process");
    execFile(path.join(__dirname, "watcher.exe"), ["于笙"], () => {});
  });

  // 悬停在她身上时才接管鼠标，其余区域点击直接穿透到桌面/图标


  // Ctrl+Alt+Y：临时切换"可交互"模式（拖她/点她/打字）
  let interactive = false;
  globalShortcut.register("CommandOrControl+Alt+Y", () => {
    interactive = !interactive;
    win.setIgnoreMouseEvents(!interactive, { forward: true });
    win.webContents.send("interactive", interactive);
    log("interactive=" + interactive);
  });

  // 按 Win+D 会把她一起最小化：立刻恢复，保证"回到桌面就能看见她"
  win.on("minimize", () => {
    setTimeout(() => { try { win.restore(); win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height }); } catch (e) {} }, 80);
  });

  ipcMain.on("open", (_e, kind) => {
    const { shell } = require("electron");
    const url = kind === "voice"
      ? "http://127.0.0.1:8848/room.html?desk=1"
      : "http://127.0.0.1:8848/room.html";
    shell.openExternal(url).catch(() => {});
  });

  ipcMain.on("quit", () => app.quit());
  app.on("window-all-closed", () => app.quit());
}

app.whenReady().then(createWindow);
