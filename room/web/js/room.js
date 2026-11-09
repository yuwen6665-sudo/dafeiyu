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
