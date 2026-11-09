/* 于笙桌宠：Q 版小肥鱼，在桌面上到处跑、做小动作、说话。
 * 交互：拖拽、右键菜单（换动作/说话/语音/打开房间/退出）、鼠标靠近走过来、没事找你说句话。
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

let x = 50;
let facing = 1;
let busy = false;
let dragging = false;
let mouseX = -1;
let talking = 0;
let buf = "";
let audio = null;

function setAnim(name) {
  const file = ANIM[name] || ANIM.idle;
  const src = "pets/" + encodeURIComponent(file);
  if (!video.src.endsWith(encodeURIComponent(file))) video.src = src;
  video.play().catch(() => {});
}

/* 透明窗口里 <video> 会变白底，逐帧画到 canvas 保留 alpha */
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
  const h = Math.max(120, Math.min(window.innerHeight * 0.16, 220));
  petEl.style.height = h + "px";
}

function place() {
  petEl.style.left = x + "%";
  petEl.classList.toggle("flip", facing < 0);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function walkTo(targetX, fast = false) {
  if (busy || dragging) return;
  busy = true;
  facing = targetX > x ? 1 : -1;
  place();
  setAnim(fast ? "run" : "walk");
  const speed = fast ? 0.55 : 0.3;
  while (!dragging && Math.abs(targetX - x) > 0.8) {
    await sleep(60);
    const d = Math.sign(targetX - x) * speed * 0.6;
    x = Math.abs(targetX - x) < Math.abs(d) ? targetX : x + d;
    place();
  }
  setAnim("idle");
  await sleep(300);
  busy = false;
}

async function wander() {
  await walkTo(8 + Math.random() * 84, Math.random() < 0.35);
}

async function act() {
  if (busy || dragging) return;
  busy = true;
  const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  setAnim(a);
  await sleep(2200 + Math.random() * 2600);
  setAnim("idle");
  busy = false;
}

async function loop() {
  for (;;) {
    await sleep(1800 + Math.random() * 2600);
    if (window.__freeze) continue;
    if (busy || dragging || talking > 0) continue;

    // 鼠标靠近就自己走过去（太近就不动，免得抖）
    if (mouseX >= 0) {
      const mx = (mouseX / window.innerWidth) * 100;
      const dist = Math.abs(mx - x);
      if (dist > 6 && dist < 55 && Math.random() < 0.55) {
        await walkTo(mx < 6 ? 6 : mx > 94 ? 94 : mx, dist > 30);
        continue;
      }
    }

    const r = Math.random();
    if (r < 0.4) await wander();
    else if (r < 0.75) await act();
    else setAnim(Math.random() < 0.5 ? "idle2" : "idle");
  }
}

/* ---------- 说话 ---------- */
function showBubble(text) { bubble.textContent = text; bubble.classList.add("on"); }
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
  setTimeout(hideBubble, 3200);
}

/* ---------- 事件流 ---------- */
function connect() {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch (err) { return; }
    if (e.type === "speech" && e.op === "text") {
      talking++;
      buf += e.text;
      showBubble(buf);
      if (/[。！？!?\n]$/.test(buf) || buf.length >= 28) {
        const s = buf; buf = "";
        speak(s);
      }
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

/* ---------- 鼠标 ---------- */
window.addEventListener("mousemove", (e) => { mouseX = e.clientX; });

/* ---------- 拖拽 ---------- */
let dragOffX = 0;
petEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  petEl.setPointerCapture(e.pointerId);
  const r = petEl.getBoundingClientRect();
  dragOffX = e.clientX - (r.left + r.width / 2);
  setAnim("float");
  e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const cx = e.clientX - dragOffX;
  x = Math.max(2, Math.min(98, (cx / window.innerWidth) * 100));
  place();
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
  <div class="item" data-act="say">说句话</div>
  <div class="item" data-act="voice">语音对话</div>
  <div class="item" data-act="room">打开房间</div>
  <div class="sep"></div>
  <div class="item" data-act="quit">退出</div>
  <div id="submenu"></div>
`;
document.body.appendChild(menu);

const submenu = menu.querySelector("#submenu");
for (const key of Object.keys(ANIM)) {
  const el = document.createElement("div");
  el.className = "item sub";
  el.textContent = ANIM_NAMES[key] || key;
  el.onclick = () => {
    setAnim(key);
    hideMenu();
    setTimeout(() => { if (!busy) setAnim("idle"); }, 2600);
  };
  submenu.appendChild(el);
}

function hideMenu() {
  menu.classList.remove("on");
  submenu.classList.remove("on");
}

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  menu.style.left = Math.min(e.clientX, window.innerWidth - 190) + "px";
  menu.style.top = Math.min(e.clientY, window.innerHeight - 240) + "px";
  menu.classList.add("on");
});
window.addEventListener("mousedown", (e) => {
  if (!menu.contains(e.target)) { hideMenu(); submenu.classList.remove("on"); }
});

menu.addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  if (act === "anim") { submenu.classList.toggle("on"); return; }
  if (act === "say") { say(LINES[Math.floor(Math.random() * LINES.length)]); hideMenu(); }
  if (act === "voice") { window.yusheng && window.yusheng.voice && window.yusheng.voice(); hideMenu(); }
  if (act === "room") { window.yusheng && window.yusheng.room && window.yusheng.room(); hideMenu(); }
  if (act === "quit") { window.yusheng && window.yusheng.quit(); }
});

/* ---------- 没事找你说句话 ---------- */
async function idleChat() {
  for (;;) {
    await sleep((8 + Math.random() * 7) * 60 * 1000);
    if (dragging || talking > 0) continue;
    if (Math.random() < 0.6) say(LINES[Math.floor(Math.random() * LINES.length)]);
  }
}

// 把她的位置报给宿主，宿主据此决定这块区域是否接收鼠标
setInterval(() => {
  if (!window.yusheng || !window.yusheng.bounds) return;
  const r = petEl.getBoundingClientRect();
  window.yusheng.bounds({ l: r.left, t: r.top, r: r.right, b: r.bottom, dpr: window.devicePixelRatio || 1 });
}, 120);

resizePet();
place();
window.addEventListener("resize", () => { resizePet(); place(); });
loop();
connect();
idleChat();
