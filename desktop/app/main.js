// 于笙桌面挂件 v3
//
// 设计（2026-11-09 确认）：
//   · 完整可见 / 约 1 次每分钟 / 主区域 / 每次停 40–120 秒
//   · 永远浮在最前面
//   · 位置记忆、全屏自动隐藏（所有全屏）、手动隐藏、缩放三档（80/100/125）
//   · 心情读 feiyu-mood 的 state.json（只读）
const { app, BrowserWindow, screen, ipcMain, globalShortcut, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const URL = process.env.YUSHENG_URL || "http://127.0.0.1:8848/pet.html?pet=1";
const W0 = 360;
const H0 = 380;
const SCALES = [0.8, 1, 1.25];
const PET_RATIO = { w: 160, h: 200, bottom: 6 };
const MOOD_FILE = path.join(process.env.USERPROFILE || "C:/Users", ".dsh/feiyu-mood/state.json");
const PREFS_FILE = path.join(__dirname, "pet-prefs.json");
const FS_EXE = path.join(__dirname, "fullscreen.exe");

app.setPath("userData", path.join(__dirname, "udata"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-transparent-visuals");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("remote-debugging-port", "9224");

let win = null;
let scale = 1;
let hiddenByUser = false;
let fullscreenNow = false;
let prefs = { left: null, top: null, scale: 1, hiddenByUser: false };
let saveTimer = null;
let roamTimer = null;

function W() { return Math.round(W0 * scale); }
function H() { return Math.round(H0 * scale); }
function petSize() { return { w: PET_RATIO.w * scale, h: PET_RATIO.h * scale, bottom: PET_RATIO.bottom * scale }; }

function log(msg) {
  try { fs.appendFileSync(path.join(__dirname, "overlay.log"), new Date().toISOString() + " " + msg + "\n"); } catch (e) {}
}

function loadPrefs() {
  try {
    const p = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
    prefs = Object.assign(prefs, p);
    if (SCALES.includes(prefs.scale)) scale = prefs.scale;
    hiddenByUser = !!prefs.hiddenByUser;
  } catch (e) {}
}

function savePrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const [x, y] = win.getPosition();
      prefs.left = x; prefs.top = y; prefs.scale = scale; prefs.hiddenByUser = hiddenByUser;
      fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
    } catch (e) {}
  }, 400);
}

function workArea() {
  const d = screen.getPrimaryDisplay();
  return d.workArea || d.bounds;
}

function clampToWork(x, y) {
  const wa = workArea();
  const minX = wa.x - (W() - 90);
  const maxX = wa.x + wa.width - 90;
  const minY = wa.y - (H() - 90);
  const maxY = wa.y + wa.height - 90;
  return [Math.round(Math.min(maxX, Math.max(minX, x))), Math.round(Math.min(maxY, Math.max(minY, y)))];
}

// ---------- 心情（只读 feiyu-mood） ----------
function readMood() {
  try {
    const s = JSON.parse(fs.readFileSync(MOOD_FILE, "utf8"));
    const y = (s.moods && s.moods.yusheng) || {};
    const dims = y.dims || {};
    const mood = typeof y.mood === "number" ? y.mood : 70;
    const label = mood >= 80 ? "很开心" : mood >= 65 ? "挺好的" : mood >= 50 ? "平静" : mood >= 35 ? "有点低落" : "难过";
    return { mood: Math.round(mood), label, dims, reason: y.lastReason || "" };
  } catch (e) {
    return null;
  }
}

function startMoodWatch() {
  const tick = () => {
    const m = readMood();
    if (m && win) { try { win.webContents.send("mood", m); } catch (e) {} }
  };
  tick();
  setInterval(tick, 30000);
}

// ---------- 全屏检测 ----------
let fsBusy = false;

function checkFullscreen(cb) {
  if (fsBusy) return;
  fsBusy = true;
  execFile(FS_EXE, { timeout: 2000, windowsHide: true }, (err, stdout) => {
    fsBusy = false;
    cb(!err && String(stdout || "").trim() === "1");
  });
}

function startFullscreenWatch() {
  setInterval(() => {
    if (!win) return;
    checkFullscreen((isFs) => {
      if (!win) return;
      if (isFs === fullscreenNow) return;
      fullscreenNow = isFs;
      if (isFs) {
        if (win.isVisible()) { win.hide(); log("fullscreen -> hide"); }
        return;
      }
      if (!hiddenByUser && !win.isVisible()) { win.show(); log("fullscreen exit -> show"); }
    });
  }, 1500);
}

// ---------- 漫游 ----------
function setAnim(name) {
  try { win.webContents.send("anim", name); } catch (e) {}
}

function startRoam() {
  const nextDelay = () => 40000 + Math.random() * 80000;

  const moveOnce = () => {
    if (!win || !win.isVisible()) { roamTimer = setTimeout(moveOnce, 15000); return; }
    const wa = workArea();
    const ps = petSize();
    const startPos = win.getPosition();

    const minCx = wa.x + 30 + ps.w / 2;
    const maxCx = wa.x + wa.width - 30 - ps.w / 2;
    const minCy = wa.y + 70 + ps.h / 2;
    const maxCy = wa.y + wa.height - 80 - ps.h / 2;
    if (maxCx <= minCx || maxCy <= minCy) { roamTimer = setTimeout(moveOnce, nextDelay()); return; }

    const targetCx = minCx + Math.random() * (maxCx - minCx);
    const targetCy = minCy + Math.random() * (maxCy - minCy);
    const targetX = targetCx - W() / 2;
    const targetY = targetCy - (H() - ps.bottom - ps.h / 2);

    const dx = targetX - startPos[0];
    const dy = targetY - startPos[1];
    const dist = Math.hypot(dx, dy);
    const maxStep = (420 + Math.random() * 380) * scale;
    const k = dist > maxStep ? maxStep / dist : 1;
    const endX = Math.round(startPos[0] + dx * k);
    const endY = Math.round(startPos[1] + dy * k);

    const dur = 900 + Math.min(2600, dist * 1.2);
    const t0 = Date.now();
    const fast = Math.random() < 0.25;
    setAnim(fast ? "run" : "walk");

    const iv = setInterval(() => {
      if (!win) { clearInterval(iv); return; }
      const p = Math.min(1, (Date.now() - t0) / dur);
      const x = startPos[0] + (endX - startPos[0]) * p;
      const y = startPos[1] + (endY - startPos[1]) * p;
      const [cx2, cy2] = clampToWork(x, y);
      try { win.setPosition(cx2, cy2); } catch (e) {}
      if (p >= 1) {
        clearInterval(iv);
        savePrefs();
        setAnim("idle");
        if (Math.random() < 0.6) {
          const acts = ["cat", "snack", "yawn", "stretch", "sing", "mirror", "bubble", "dance", "idle2"];
          const a = acts[Math.floor(Math.random() * acts.length)];
          setAnim(a);
          setTimeout(() => setAnim(Math.random() < 0.5 ? "idle" : "idle2"), 3000 + Math.random() * 6000);
        }
        roamTimer = setTimeout(moveOnce, nextDelay());
      }
    }, 30);
  };

  roamTimer = setTimeout(moveOnce, 8000 + Math.random() * 20000);
}

// ---------- 缩放 / 显隐 ----------
function applyScale(next) {
  if (!win || !SCALES.includes(next)) return;
  const [oldX, oldY] = win.getPosition();
  const cxOld = oldX + W() / 2;
  const cyOld = oldY + H() / 2;
  scale = next;
  win.setMinimumSize(W(), H());
  win.setMaximumSize(W(), H());
  win.setContentSize(W(), H());
  const [nx, ny] = clampToWork(cxOld - W() / 2, cyOld - H() / 2);
  win.setPosition(nx, ny);
  savePrefs();
  log("scale -> " + scale);
}

function toggleHidden() {
  if (!win) return;
  hiddenByUser = !hiddenByUser;
  if (hiddenByUser) win.hide(); else win.show();
  savePrefs();
  log("hiddenByUser=" + hiddenByUser);
}

// ---------- 启动 ----------
function createWindow() {
  loadPrefs();
  const wa = workArea();
  const w = W(), h = H();
  let x = prefs.left, y = prefs.top;
  if (x == null || y == null) {
    x = Math.round(wa.x + wa.width / 2 - w / 2);
    y = Math.round(wa.y + wa.height - h - 72);
  }
  [x, y] = clampToWork(x, y);

  win = new BrowserWindow({
    x, y, width: w, height: h,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    show: false,
    title: "于笙的桌宠",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
      zoomFactor: 1,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setMinimumSize(w, h);
  win.setMaximumSize(w, h);
  win.setContentSize(w, h);
  win.setIgnoreMouseEvents(true, { forward: true });

  win.webContents.on("did-finish-load", () => {
    try {
      win.webContents.setZoomFactor(1);
      if (!hiddenByUser) win.show();
      const m0 = readMood();
      if (m0) { try { win.webContents.send("mood", m0); } catch (e) {} }
      log("ready " + w + "x" + h + " at " + x + "," + y);
    } catch (e) {}
  });

  win.loadURL(URL);

  ipcMain.on("move", (_e, pos) => {
    if (!win) return;
    const cx = typeof pos === "number" ? pos : pos.cx;
    const cy = typeof pos === "number" ? (win.getPosition()[1] + H() / 2) : pos.cy;
    const [nx, ny] = clampToWork(cx - W() / 2, cy - H() / 2);
    win.setPosition(nx, ny);
    savePrefs();
  });

  ipcMain.on("hover", (_e, over) => {
    if (win) win.setIgnoreMouseEvents(!over, { forward: true });
  });

  ipcMain.on("open", (_e, kind) => {
    const url = kind === "voice"
      ? "http://127.0.0.1:8848/room.html?desk=1"
      : "http://127.0.0.1:8848/room.html";
    shell.openExternal(url).catch(() => {});
  });

  ipcMain.on("scale", (_e, pct) => {
    const s = Number(pct) / 100;
    if (SCALES.includes(s)) applyScale(s);
  });

  ipcMain.on("quit", () => app.quit());

  win.on("minimize", () => {
    setTimeout(() => { try { win.restore(); } catch (e) {} }, 80);
  });

  globalShortcut.register("CommandOrControl+Alt+Y", () => {
    const on = win.isAlwaysOnTop();
    win.setAlwaysOnTop(!on);
    log("alwaysOnTop=" + !on);
  });
  globalShortcut.register("CommandOrControl+Alt+H", toggleHidden);
  globalShortcut.register("CommandOrControl+Alt+1", () => applyScale(0.8));
  globalShortcut.register("CommandOrControl+Alt+2", () => applyScale(1));
  globalShortcut.register("CommandOrControl+Alt+3", () => applyScale(1.25));

  app.on("window-all-closed", () => app.quit());
}

app.whenReady().then(() => {
  createWindow();
  startFullscreenWatch();
  startMoodWatch();
  startRoam();
});
