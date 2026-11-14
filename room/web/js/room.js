/* 房间视图：把她放进暖色卧室，接 SSE / 语音 / 字幕。
 * ?desk=1   桌面模式（隐藏输入条、隐藏鼠标）
 * ?debug    把字幕与音频进度写进标题，方便排查同步
 * ?tts=off  只字幕不出声
 */
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
if (params.has("overlay")) document.body.classList.add("overlay");
if (params.has("nochar")) document.addEventListener("DOMContentLoaded", () => {
  const c = document.querySelector("#char");
  if (c) c.style.display = "none";
});
if (params.has("desk")) {
  document.getElementById("stage").classList.add("desk");
  document.body.classList.add("desk");
  document.title = "于笙的房间";
}

const api = (path, body) => fetch(path, {
  method: body === undefined ? "GET" : "POST",
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then((r) => r.json()).catch(() => null);

async function main() {
  const manifest = await fetch("assets/manifest.json").then((r) => r.json());
  window.__spriteAspect = manifest.sprites.width / manifest.sprites.height;
  document.documentElement.style.setProperty("--char-aspect", window.__spriteAspect);
  const avatar = new Avatar($("#char"), manifest);
  window.avatar = avatar;
  await avatar.load();

  const voice = params.get("tts") === "off"
    ? null
    : new CloudVoice(avatar, { timbre: { emotion: "happy", emotion_scale: 2, speech_rate: 2, pitch_rate: 6 } });
  const player = new SpeechPlayer({ avatar, subtitle: $("#subtitle"), voice });
  window.player = player;

  layout();
  window.addEventListener("resize", layout);

  if (params.has("debug")) {
    setInterval(() => {
      const t = $("#subtitle").textContent || "";
      const a = voice && voice.current;
      const info = a ? `${a.currentTime.toFixed(1)}/${isFinite(a.duration) ? a.duration.toFixed(1) : "?"}` : "noaudio";
      document.title = `[${info}] ${t}`;
    }, 200);
  }

  connect({ avatar, player });
  bindConsole();
  bindMic();
  bindBudget();

  // 点她一下：抬头 + 随机反应（先本地反应，之后接大脑）
  $("#char").addEventListener("click", () => {
    avatar.motion(["nod", "hop", "tilt", "wiggle"][Math.floor(Math.random() * 4)]);
  });
}

function layout() {
  const stage = $("#stage");
  const char = $("#char");
  const h = stage.clientHeight;
  const w = stage.clientWidth;
  const charH = Math.round(Math.min(h * 0.62, w * 0.42));
  const aspect = (window.__spriteAspect || 0.805);
  char.style.height = charH + "px";
  char.style.width = Math.round(charH * aspect) + "px";
}

function connect({ avatar, player }) {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    switch (e.type) {
      case "hello":
        avatar.setEmotion(e.emotion, { react: false, instant: true });
        avatar.setState(e.state === "listening" ? "listening" : "idle");
        break;
      case "speech":
        if (e.op === "begin") player.begin(e.id, { queue: !!e.queue });
        else player.push(e);
        break;
      case "state":
        if (e.state === "thinking" && !$("#subtitle").textContent) {
          $("#subtitle").innerHTML = '<span class="dots"></span>';
        }
        if (e.state !== "thinking") $("#subtitle .dots")?.remove();
        avatar.setState(e.state);
        break;
      case "emotion":
        avatar.setEmotion(e.name, { hold: e.hold || 0, instant: !!e.instant });
        break;
      case "motion":
        avatar.motion(e.name);
        break;
      case "mouth":
        if (Array.isArray(e.levels)) avatar.playMouthLevels(e.levels, e.fps || 60);
        else avatar.setMouthLevel(+e.level || 0);
        break;
      case "interrupt":
        player.interrupt();
        avatar.setState("idle");
        break;
    }
  };
}

function bindConsole() {
  const form = $("#console"), input = $("#input");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    api("/api/chat", { text, wait: false });
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { api("/api/interrupt", {}); return; }
    if (ev.key === "Enter" && document.activeElement !== input) { ev.preventDefault(); input.focus(); }
  });
}

// ---------- 按住说话（Push-to-Talk → ASR） ----------
function bindMic() {
  const btn = $("#mic");
  if (!btn) return;
  let holding = false, rec = null, chunks = [], stream = null, startedAt = 0;

  const preferred = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
  const mime = preferred.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";

  const begin = async () => {
    if (holding) return;
    holding = true;
    btn.classList.add("rec");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks = [];
      startedAt = Date.now();
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start();
    } catch (err) {
      holding = false;
      btn.classList.remove("rec");
      setHint("没有麦克风权限…");
      console.warn("mic:", err);
    }
  };

  const end = async () => {
    if (!holding) return;
    holding = false;
    btn.classList.remove("rec");
    if (!rec) return;
    const elapsed = Date.now() - startedAt;
    const recRef = rec;
    rec = null;
    const blob = await new Promise((resolve) => {
      recRef.onstop = () => resolve(new Blob(chunks, { type: recRef.mimeType || "audio/ogg" }));
      try { recRef.stop(); } catch (e) { resolve(new Blob([])); }
    });
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (elapsed < 500 || !blob.size) { setHint("按住说话，松手发送"); return; }

    setHint("在听…");
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 8192) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    }
    const fmt = (recRef.mimeType || "").includes("ogg") ? "ogg" : "webm";
    const out = await api("/api/asr", { data: btoa(bin), fmt });
    if (!out || !out.text) {
      setHint(out && out.detail ? String(out.detail).slice(0, 80) : "没听清，再说一次？");
      return;
    }
    setHint("");
    const input = $("#input");
    input.value = out.text;
    $("#console").dispatchEvent(new Event("submit", { cancelable: true }));
  };

  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); begin(); });
  btn.addEventListener("pointerup", (e) => { e.preventDefault(); end(); });
  btn.addEventListener("pointercancel", () => { end(); });
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

function setHint(text) {
  const el = $("#subtitle");
  if (!el) return;
  if (!text) return;
  el.textContent = text;
  clearTimeout(setHint._t);
  setHint._t = setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 2600);
}

// ---------- 本月预算徽标 ----------
async function bindBudget() {
  const el = $("#budget");
  if (!el) return;
  const tick = async () => {
    const b = await api("/api/budget");
    if (!b || typeof b.total !== "number") return;
    el.textContent = "本月 ¥" + b.total.toFixed(2);
    el.title = `本月花费 ¥${b.total.toFixed(2)}｜降级 ${b.degrade_at}｜熔断 ${b.stop_at}`;
    el.classList.toggle("warn", b.level !== "normal");
    if (b.level !== "normal") el.textContent += b.level === "stop" ? "（已熔断）" : "（省电模式）";
  };
  tick();
  setInterval(tick, 60000);
}

// 覆盖模式：透明背景 + 鼠标悬停在她身上才接管点击
if (params.has("overlay")) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  if (window.yusheng) {
    let over = false;
    window.addEventListener("mousemove", (e) => {
      const c = document.querySelector("#char");
      if (!c) return;
      const r = c.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside !== over) { over = inside; window.yusheng.hover(inside); }
    });
  }
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend",
    `<pre style="position:fixed;top:8px;left:8px;color:#f88;z-index:99">${e}</pre>`);
});
