/* CloudVoice —— 云端 TTS 播放器（火山 · 复刻音色）
 *
 * 用法（在 speech.js 里）：
 *   const voice = new CloudVoice(avatar, { timbre: { emotion: "happy", emotion_scale: 2 } });
 *   const player = new SpeechPlayer({ avatar, subtitle, voice });
 *
 * 契约：SpeechPlayer 只要求 voice = { speak(text, opts?): Promise, cancel() }；
 * 若 voice.supportsTiming === true，SpeechPlayer 会按音频进度出字幕。
 */
class CloudVoice {
  constructor(avatar, { timbre = null } = {}) {
    this.avatar = avatar;
    this.supportsTiming = true;    // 字幕/口型按音频进度走
    this.timbre = timbre;          // 可传 { emotion, emotion_scale, speech_rate, pitch_rate }
    this.current = null;
    this._stop = null;
    this.ctx = null;
    this.ana = null;
    this.buf = null;
    this.raf = 0;
    this.muted = new URLSearchParams(location.search).has("noaudio");
  }

  _audioCtx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.ana = this.ctx.createAnalyser();
      this.ana.fftSize = 1024;
      this.ana.smoothingTimeConstant = 0.55;
      this.buf = new Uint8Array(this.ana.fftSize);
      this.ana.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
    return this.ctx;
  }

  async speak(text, { onRatio } = {}) {
    if (this.muted) return;
    let url, audio;
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...(this.timbre || {}) }),
      });
      if (!r.ok) throw new Error("tts " + r.status);
      const blob = await r.blob();
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      audio.preload = "auto";
    } catch (e) {
      console.warn("[tts]", e.message);
      onRatio?.(1);                // 没有语音就把字幕一次显示完
      return;
    }

    this.current = audio;
    window.__yyAudio = audio;      // 调试用：CDP 里可以读 currentTime/duration

    // 拿到真实时长（拿不到按字数估），字幕按 currentTime/duration 出字
    const est = Math.max(0.9, text.length * 0.22);
    const dur = await new Promise((res) => {
      if (audio.readyState >= 1 && isFinite(audio.duration) && audio.duration > 0) return res(audio.duration);
      const timer = setTimeout(() => res(est), 1500);
      audio.addEventListener("loadedmetadata", () => {
        clearTimeout(timer);
        res(isFinite(audio.duration) && audio.duration > 0 ? audio.duration : est);
      }, { once: true });
      audio.addEventListener("error", () => { clearTimeout(timer); res(est); }, { once: true });
    });

    const ctx = this._audioCtx();
    if (ctx) {
      try {
        const src = ctx.createMediaElementSource(audio);
        src.connect(this.ana);     // ana 已接到 destination
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      } catch (e) { /* 元素已被接管过，直接走默认输出 */ }
    }

    const tick = () => {
      if (this.current !== audio) return;
      if (this.ana) {
        this.ana.getByteTimeDomainData(this.buf);
        let sum = 0;
        for (let i = 0; i < this.buf.length; i++) {
          const v = (this.buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / this.buf.length);
        this.avatar.setMouthLevel(Math.min(1, rms * 3.2));
      }
      if (onRatio) onRatio(Math.min(1, (audio.currentTime || 0) / dur));
      this.raf = requestAnimationFrame(tick);
    };

    await new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(this.raf);
        this.avatar.setMouthLevel(0);
        URL.revokeObjectURL(url);
        if (this.current === audio) this.current = null;
        if (window.__yyAudio === audio) window.__yyAudio = null;
        this._stop = null;
        onRatio?.(1);
        resolve();
      };
      this._stop = () => { try { audio.pause(); } catch (e) {} finish(); };
      audio.onended = finish;
      audio.onerror = finish;

      // 浏览器拦截自动播放时（没有用户手势），用估算时长推进字幕，至少读得下来
      const fallback = () => {
        const t0 = performance.now();
        const step = () => {
          if (finished) return;
          if (this.current !== audio) return finish();
          const r = Math.min(1, (performance.now() - t0) / (dur * 1000));
          onRatio?.(r);
          if (r >= 1) return finish();
          this.raf = requestAnimationFrame(step);
        };
        step();
      };

      audio.play().then(() => {
        this.raf = requestAnimationFrame(tick);
      }).catch((e) => {
        console.warn("[tts] 播放被拦截，改按时间估算字幕", e && e.name);
        fallback();
      });
    });
  }

  cancel() {
    if (this._stop) this._stop();
    else if (this.current) { try { this.current.pause(); } catch (e) {} this.current = null; }
  }
}
