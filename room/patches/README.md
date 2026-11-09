# 对 yuyaya（大肥鱼数字人）的改动

本仓库**不包含 yuyaya 的源码**（第三方项目，未在其仓库找到明确许可证）。
下面是把它接成"于笙"需要的全部改动，升级时照着重做一遍即可。

上游：`https://github.com/Lin-A1/yuyaya`

## 1. 新增服务端 TTS 模块

把本仓库的 `room/server-tts.py` 复制为 `yuyaya/server/tts.py`。

## 2. 在 `server/app.py` 里挂上 `/api/tts`

```python
from fastapi.responses import Response          # 已有 FileResponse/StreamingResponse，补 Response
from .tts import synth as tts_synth             # 新增

# 在 web = ROOT / "web" 之前插入：
@app.post("/api/tts")
async def tts(body: dict = Body(...)):
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text is required")
    try:
        audio = await asyncio.to_thread(
            tts_synth, text,
            body.get("emotion") or "",
            int(body.get("emotion_scale") or 0),
            int(body.get("speech_rate") or 0),
            int(body.get("pitch_rate") or 0),
        )
    except Exception as exc:
        log.warning("tts 失败: %s", exc)
        raise HTTPException(502, f"tts failed: {exc}") from exc
    return Response(audio, media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=3600"})
```

## 3. 让大脑支持 `system_file`（用角色卡当 system prompt）

`server/brains/openai_compat.py`：

```python
def _system(self) -> str:
    c = self.conf
    path = c.get("system_file")
    if path:
        try:
            with open(path, encoding="utf-8") as f:
                return f.read()
        except OSError:
            pass
    return c.get("system", PERSONA)

# stream() 里把 c.get("system", PERSONA) 换成 self._system()
```

然后在 `config.json` 里：

```json
{
  "default": "yusheng",
  "brains": {
    "yusheng": {
      "type": "openai",
      "label": "于笙",
      "base_url": "https://api.deepseek.com",
      "model": "deepseek-chat",
      "api_key_env": "DEEPSEEK_API_KEY",
      "system_file": "../persona/于笙.md",
      "extra": { "temperature": 1.15, "max_tokens": 260, "frequency_penalty": 0.3 }
    }
  }
}
```

> 角色卡改了不用重启，每次请求都会重新读文件。

## 4. 前端语音 + 字幕同步（`web/js/speech.js`）

在文件末尾追加 `CloudVoice` 类（见本仓库 `room/patches/CloudVoice.js`），并把
`SpeechPlayer._speak()` 改成"有 `voice.supportsTiming` 时按音频进度出字"。

要点：

```js
if (this.voice && this.voice.supportsTiming) {
  // 字幕按 audio.currentTime / duration 推进，口型由 AnalyserNode 音量驱动
  // 浏览器拦截自动播放时，退回按估算时长（每字 0.22s）推进
}
```

## 5. 换成我们的房间/桌宠页面

把本仓库 `room/web/` 下的文件复制进 `yuyaya/web/`：

```
room.html  pet.html
css/room.css
js/room.js  js/pet.js
pets/*.webm          ← Q 版大肥鱼动画（MIT，见 pets/LICENSE-大肥鱼素材.txt）
```

访问：

- 房间：`http://127.0.0.1:8848/room.html`
- 桌面模式：`http://127.0.0.1:8848/room.html?desk=1`
- 桌宠：`http://127.0.0.1:8848/pet.html?pet=1`

## 已知问题

- **透明窗口里 `<video>` 会失去 alpha**：本仓库的 `pet.js` 已经把视频逐帧画到 canvas 绕过
- **Chromium 窗口挂进 WorkerW（真壁纸层）后视口会坏**：实测窗口 2560×1600 但页面只有 580×127，
  所以最终没用壁纸层方案，改用"透明窗口 + 鼠标命中区穿透"
