/* 于笙桌宠 v2（小窗口版）
 *
 * 窗口只有 360×380，她一直在窗口中间。所谓"到处跑"= 让宿主移动整个窗口。
 * 好处：点击 / 拖拽 / 右键全部是正常鼠标事件，不再依赖"动态穿透"。
 */
const ANIM = {
  idle: "待机呼吸休闲.webm",
  idle2: "东张西望.webm",
  walk: "螃蟹走路.webm",
  run: "原地左转奔跑.webm",
  float: "原地漂浮踏步.webm",
  wave: "点击回应-元气挥手.webm",
  happy: "点击回应-开心跃动.webm",
  dance: "轻快摇摆舞.webm",
  cat: "撸猫.webm",
  snack: "大口吃零食.webm",
  yawn: "哈欠连天.webm",
  sleep: "原地小憩沉眠.webm",
  stretch: "超大伸懒腰.webm",
  sing: "悠闲哼歌.webm",
  mirror: "照镜子.webm",
  bubble: "鲸鱼吐泡泡特效.webm",
};

const ANIM_NAMES = {
  idle: "待机", idle2: "东张西望", walk: "走路", run: "跑", float: "漂浮踏步",
  wave: "挥手", happy: "开心", dance: "跳舞", cat: "撸猫", snack: "吃零食",
  yawn: "打哈欠", sleep: "睡觉", stretch: "伸懒腰", sing: "哼歌", mirror: "照镜子", bubble: "吐泡泡",
};

const ACTIONS = ["cat", "snack", "yawn", "stretch", "sing", "mirror", "bubble", "happy", "dance"];
const LINES = [
  "爸爸在忙吗……",
  "我就看看你在干嘛",
  "嗯？你在想什么呀",
  "有点无聊诶",
  "喝口水吧",
  "我在这儿哦",
  "你眼睛累了就看看我嘛",
];

const petEl = document.getElementById("pet");
const video = document.getElementById("anim");
const bubble = document.getElementById("bubble");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const bridge = window.yusheng || null;

let cx = 0;
let cy = 0;
let busy = false;
let dragging = false;
let talking = 0;
let buf = "";
let audio = null;

function sendMove() { if (bridge && bridge.move) bridge.move({ cx, cy }); }

function setAnim(name) {
  const file = ANIM[name] || ANIM.idle;
  const src = "pets/" + encodeURIComponent(file);
  if (!video.src.endsWith(encodeURIComponent(file))) video.src = src;
  video.play().catch(() => {});
}

/* 透明窗口里 <video> 会失去 alpha，逐帧画到 canvas */
function drawFrame() {
  if (video.readyState >= 2 && video.videoWidth) {
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);

function resizePet() {
  // 跟着窗口一起缩放：100% 时窗口高 380 → 本体 200
  const h = Math.round(window.innerHeight * 0.526);
  petEl.style.height = h + "px";
}

function face(dir) {
  petEl.classList.toggle("flip", dir < 0);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function walkTo(targetCx, targetCy, fast) {
  if (busy || dragging) return;
  busy = true;
  face(targetCx > cx ? 1 : -1);
  setAnim(fast ? "run" : "walk");
  const speed = fast ? 9 : 4;
  while (!dragging && (Math.abs(targetCx - cx) > 2 || Math.abs(targetCy - cy) > 2)) {
    await sleep(16);
    const dx = Math.sign(targetCx - cx) * speed;
    const dy = Math.sign(targetCy - cy) * speed * 0.9;
    cx = Math.abs(targetCx - cx) < Math.abs(dx) ? targetCx : cx + dx;
    cy = Math.abs(targetCy - cy) < Math.abs(dy) ? targetCy : cy + dy;
    sendMove();
  }
  setAnim("idle");
  await sleep(250);
  busy = false;
}

async function wander() {
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  const maxCx = screen.width - hw - 12, minCx = hw + 12;
  const maxCy = screen.height - hh - 60, minCy = hh + 40;
  if (maxCx <= minCx || maxCy <= minCy) return;
  // 大部分时间在地面附近，偶尔飞到上面去
  const ty = Math.random() < 0.65
    ? maxCy - Math.random() * 120
    : minCy + Math.random() * (maxCy - minCy);
  await walkTo(minCx + Math.random() * (maxCx - minCx), ty, Math.random() < 0.35);
}

async function act() {
  if (busy || dragging) return;
  busy = true;
  const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  setAnim(a);
  await sleep(2200 + Math.random() * 2400);
  setAnim("idle");
  busy = false;
}

let loopCount = 0;
async function loop() {
  for (;;) {
    loopCount++;
    await sleep(2000 + Math.random() * 2600);
    if (busy || dragging || talking > 0) continue;
    const r = Math.random();
    if (r < 0.45) await wander();
    else if (r < 0.78) await act();
    else setAnim(Math.random() < 0.5 ? "idle2" : "idle");
  }
}

/* ---------- 说话 ---------- */
function showBubble(t) { bubble.textContent = t; bubble.classList.add("on"); }
function hideBubble() { bubble.classList.remove("on"); }

async function speak(text) {
  const t = (text || "").trim();
  if (!t) return;
  try {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, emotion: "happy", emotion_scale: 2, speech_rate: 2, pitch_rate: 6 }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    if (audio) { try { audio.pause(); } catch (e) {} }
    audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch (e) {}
}

function say(text) {
  showBubble(text);
  speak(text);
  setAnim("wave");
  setTimeout(() => { if (!busy) setAnim("idle"); }, 1400);
  setTimeout(hideBubble, 3400);
}

function connect() {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch (err) { return; }
    if (e.type === "speech" && e.op === "text") {
      talking++;
      buf += e.text;
      showBubble(buf);
      if (/[。！？!?\n]$/.test(buf) || buf.length >= 28) { const s = buf; buf = ""; speak(s); }
      return;
    }
    if (e.type === "speech" && e.op === "begin") { talking = 0; buf = ""; hideBubble(); return; }
    if (e.type === "speech" && e.op === "end") {
      talking = Math.max(0, talking - 1);
      if (talking === 0) setTimeout(hideBubble, 2600);
      return;
    }
    if (e.type === "emotion") {
      if (e.name === "happy") setAnim("happy");
      else if (e.name === "sad") setAnim("yawn");
      else if (e.name === "surprised") setAnim("wave");
      return;
    }
    if (e.type === "state" && e.state === "thinking") setAnim("idle2");
    if (e.type === "interrupt") { hideBubble(); buf = ""; talking = 0; }
  };
}

/* ---------- 鼠标：只有她身上才接管 ---------- */
let hovering = false;
function setHover(v) {
  if (v === hovering) return;
  hovering = v;
  if (bridge && bridge.hover) bridge.hover(v);
}
window.addEventListener("mousemove", (e) => {
  const r = petEl.getBoundingClientRect();
  const inside = e.clientX >= r.left - 8 && e.clientX <= r.right + 8 &&
                 e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
  setHover(inside);
});
window.addEventListener("mouseleave", () => setHover(false));

/* ---------- 拖拽（直接移动窗口） ---------- */
let dragOffX = 0, dragOffY = 0;
petEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  try { petEl.setPointerCapture(e.pointerId); } catch (err) {}
  // 抓取偏移：窗口中心相对鼠标的位置，拖动时保持不变（不会跳到鼠标中心）
  const winCx = (window.screenX || 0) + window.innerWidth / 2;
  const winCy = (window.screenY || 0) + window.innerHeight / 2;
  dragOffX = winCx - e.screenX;
  dragOffY = winCy - e.screenY;
  cx = winCx;
  cy = winCy;
  setAnim("float");
  e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  cx = e.screenX + dragOffX;
  cy = e.screenY + dragOffY;
  sendMove();
});
window.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  setAnim("idle");
});

petEl.addEventListener("click", () => {
  if (dragging) return;
  setAnim("wave");
  setTimeout(() => { if (!busy) setAnim("idle"); }, 1400);
});

/* ---------- 右键菜单 ---------- */
const menu = document.createElement("div");
menu.id = "menu";
menu.innerHTML = `
  <div class="item" data-act="anim">换个动作 ▸</div>
  <div class="item" data-act="size">大小 ▸ <span id="sizeCur">100%</span></div>
  <div class="item" data-act="say">说句话</div>
  <div class="item" data-act="voice">语音对话</div>
  <div class="item" data-act="room">打开房间</div>
  <div class="sep"></div>
  <div class="item info" id="moodInfo">心情：读取中…</div>
  <div class="sep"></div>
  <div class="item" data-act="quit">退出</div>
  <div id="submenu"></div>
  <div id="submenuSize"></div>
`;
document.body.appendChild(menu);
const submenu = menu.querySelector("#submenu");
const submenuSize = menu.querySelector("#submenuSize");
const SIZES = [80, 100, 125];

for (const key of Object.keys(ANIM)) {
  const el = document.createElement("div");
  el.className = "item sub";
  el.textContent = ANIM_NAMES[key] || key;
  el.onclick = () => { setAnim(key); hideMenu(); setTimeout(() => { if (!busy) setAnim(moodAnim()); }, 2600); };
  submenu.appendChild(el);
}
for (const s of SIZES) {
  const el = document.createElement("div");
  el.className = "item";
  el.dataset.size = String(s);
  el.textContent = s + "%";
  el.onclick = () => {
    if (bridge && bridge.setScale) bridge.setScale(s);
    hideMenu();
  };
  submenuSize.appendChild(el);
}

function currentScalePct() {
  return Math.round((window.innerWidth / 360) * 100);
}

function refreshMenuInfo() {
  const pct = currentScalePct();
  const cur = document.getElementById("sizeCur");
  if (cur) cur.textContent = pct + "%";
  for (const el of submenuSize.children) {
    const v = Number(el.dataset.size);
    const isCur = Math.abs(pct - v) <= 4;
    el.classList.toggle("checked", isCur);
  }
  const info = document.getElementById("moodInfo");
  if (info) {
    info.textContent = moodState
      ? "心情：" + moodState.mood + " · " + moodState.label
      : "心情：读取中…";
  }
}

function hideMenu() {
  menu.classList.remove("on");
  submenu.classList.remove("on");
  submenuSize.classList.remove("on");
}

function placePanel(panel) {
  const mr = menu.getBoundingClientRect();
  const sw = panel.offsetWidth || 110;
  const sh = panel.offsetHeight || 160;
  panel.classList.toggle("left", mr.right + sw > window.innerWidth - 4);
  panel.style.top = Math.max(-mr.top + 4, Math.min(0, window.innerHeight - mr.top - sh - 4)) + "px";
}

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  refreshMenuInfo();
  menu.classList.add("on");
  const mw = menu.offsetWidth || 180;
  const mh = menu.offsetHeight || 240;
  let left = e.clientX;
  let top = e.clientY;
  if (left + mw > window.innerWidth - 4) left = Math.max(4, window.innerWidth - mw - 4);
  if (top + mh > window.innerHeight - 4) top = Math.max(4, window.innerHeight - mh - 4);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
});

window.addEventListener("mousedown", (e) => {
  if (!menu.contains(e.target)) hideMenu();
});

menu.addEventListener("click", (e) => {
  const sizeBtn = e.target.closest("[data-size]");
  if (sizeBtn) {
    const s = Number(sizeBtn.dataset.size);
    if (bridge && bridge.setScale) bridge.setScale(s);
    hideMenu();
    return;
  }
  const hit = e.target.closest("[data-act]");
  const act = hit ? hit.dataset.act : null;
  if (!act) return;
  if (act === "anim") { submenu.classList.toggle("on"); submenuSize.classList.remove("on"); placePanel(submenu); return; }
  if (act === "size") { submenuSize.classList.toggle("on"); submenu.classList.remove("on"); placePanel(submenuSize); return; }
  if (act === "say") { say(LINES[Math.floor(Math.random() * LINES.length)]); hideMenu(); }
  if (act === "voice") { bridge && bridge.voice && bridge.voice(); hideMenu(); }
  if (act === "room") { bridge && bridge.room && bridge.room(); hideMenu(); }
  if (act === "quit") { bridge && bridge.quit && bridge.quit(); }
});
async function idleChat() {
  for (;;) {
    await sleep((8 + Math.random() * 7) * 60 * 1000);
    if (dragging || talking > 0) continue;
    if (Math.random() < 0.6) say(LINES[Math.floor(Math.random() * LINES.length)]);
  }
}

/* ---------- 调试 ---------- */
window.__errs = [];
window.addEventListener("error", (e) => window.__errs.push(String(e.message)));
window.__walk = (tx, ty, fast) => walkTo(tx, ty, fast);
window.__petDebug = () => ({ cx: Math.round(cx), cy: Math.round(cy), busy, dragging, talking, loopCount, errs: window.__errs.slice(-3) });
window.addEventListener("unhandledrejection", (e) => window.__errs.push("REJ: " + (e.reason && e.reason.message || e.reason)));

function bindAnim() {
  if (bridge && bridge.onAnim) {
    bridge.onAnim((name) => { if (ANIM[name]) setAnim(name); });
  }
}


/* ---------- 心情（来自 feiyu-mood，只读） ---------- */
let moodState = null;
let lastMoodSay = 0;

function moodAnim() {
  if (!moodState) return "idle";
  const m = moodState.mood;
  if (m >= 80) return "happy";
  if (m >= 60) return "idle";
  if (m >= 45) return "idle2";
  if (m >= 30) return "yawn";
  return "sleep";
}

function moodLines() {
  const m = moodState ? moodState.mood : 70;
  if (m >= 80) return ["今天心情好～", "嘿嘿 一切都挺好", "感觉能一口气跑完整个桌面"];
  if (m >= 60) return ["我在这儿哦", "陪着你呢", "有点想跟你说说话"];
  if (m >= 45) return ["嗯……我安静待一会儿", "有点发呆"];
  if (m >= 30) return ["有点提不起劲……", "让我缓缓"];
  return ["今天不太想说话", "想缩成一团待着"];
}

function applyMood(m) {
  moodState = m;
  if (!busy && !dragging) setAnim(moodAnim());
  // 心情台词：每天最多一句
  try {
    const today = new Date().toDateString();
    if (localStorage.getItem("moodSayDate") !== today) {
      localStorage.setItem("moodSayDate", today);
      setTimeout(() => { if (!busy && !dragging && talking === 0) say(moodLines()[0]); }, 4000);
    }
  } catch (e) {}
}

// 中性心情也要看得见：每 45 秒在两个待机之间来回换（必定变化，不靠随机）
let idleFlip = 0;
setInterval(() => {
  if (busy || dragging || talking > 0) return;
  const m = moodState ? moodState.mood : 70;
  if (m < 45) { setAnim("yawn"); return; }
  if (m >= 80) { setAnim(Math.random() < 0.5 ? "happy" : "dance"); return; }
  idleFlip = 1 - idleFlip;
  setAnim(idleFlip ? "idle2" : "idle");
}, 45000);

function bindMood() {
  if (bridge && bridge.onMood) bridge.onMood((m) => applyMood(m));
}
/* ---------- 启动 ---------- */
cx = (window.screenX || 0) + window.innerWidth / 2;
cy = (window.screenY || 0) + window.innerHeight / 2;
resizePet();
sendMove();
window.addEventListener("resize", () => {
  resizePet();
  // 跟宿主同步当前位置（不要把旧坐标发回去，否则会被拽回原位）
  cx = (window.screenX || 0) + window.innerWidth / 2;
  cy = (window.screenY || 0) + window.innerHeight / 2;
});
connect();
idleChat();
bindAnim();
bindMood();
