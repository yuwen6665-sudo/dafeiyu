"""火山引擎 TTS（声音复刻 2.0 · 琳琳 S_dWxH0Qrj2）

给 yuyaya 的 voice 接口提供音频：前端把每句话 POST /api/tts，拿到 mp3 播放。
凭证来源优先级：环境变量 VOLC_TTS_APPID / VOLC_TTS_TOKEN / VOLC_TTS_SPEAKER → volc-tts.json
结果按 hash 缓存在 .cache/tts/，同一句话只花钱一次。
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import pathlib

import requests

from . import budget

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "tts"
CACHE.mkdir(parents=True, exist_ok=True)
ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
RESOURCE_ID = "seed-icl-2.0"

log = logging.getLogger("yuyaya.tts")


def creds() -> tuple[str, str, str]:
    appid = os.environ.get("VOLC_TTS_APPID") or ""
    token = os.environ.get("VOLC_TTS_TOKEN") or ""
    speaker = os.environ.get("VOLC_TTS_SPEAKER") or ""
    if not (appid and token):
        path = ROOT / "volc-tts.json"
        if path.exists():
            cfg = json.loads(path.read_text(encoding="utf-8"))
            appid = appid or cfg.get("appid", "")
            token = token or cfg.get("access_token", "")
            speaker = speaker or cfg.get("speaker", "")
    return appid, token, speaker or "S_dWxH0Qrj2"


def synth(text: str, emotion: str = "", emotion_scale: int = 0,
          speech_rate: int = 0, pitch_rate: int = 0) -> bytes:
    """返回 mp3 字节。失败抛异常（前端会吞掉，不影响字幕）。"""
    text = (text or "").strip()
    if not text:
        raise ValueError("empty text")

    appid, token, speaker = creds()
    if not appid or not token:
        raise RuntimeError("TTS 凭证缺失：请配置环境变量或 volc-tts.json")

    key = hashlib.sha1(
        f"{speaker}|{text}|{emotion}|{emotion_scale}|{speech_rate}|{pitch_rate}".encode("utf-8")
    ).hexdigest()
    cached = CACHE / f"{key}.mp3"
    if cached.exists() and cached.stat().st_size > 1000:
        return cached.read_bytes()

    audio_params: dict = {"format": "mp3", "sample_rate": 24000}
    if emotion:
        audio_params["emotion"] = emotion
    if emotion_scale:
        audio_params["emotion_scale"] = int(emotion_scale)
    if speech_rate:
        audio_params["speech_rate"] = int(speech_rate)
    if pitch_rate:
        audio_params["pitch_rate"] = int(pitch_rate)

    body = {
        "user": {"uid": "yuyaya"},
        "req_params": {"text": text, "speaker": speaker, "audio_params": audio_params},
    }
    headers = {
        "Content-Type": "application/json",
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": token,
        "X-Api-Request-Id": hashlib.md5(key.encode()).hexdigest(),
        "X-Api-Resource-Id": RESOURCE_ID,
    }

    chunks: list[bytes] = []
    error = None
    with requests.post(ENDPOINT, json=body, headers=headers, timeout=60, stream=True) as r:
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            code = obj.get("code")
            if code not in (None, 0, 20000000):
                error = f"code={code} {obj.get('message', '')}"
                break
            data = obj.get("data")
            if data:
                chunks.append(base64.b64decode(data))

    if error:
        raise RuntimeError(f"火山 TTS 失败：{error}")
    audio = b"".join(chunks)
    if len(audio) < 1000:
        raise RuntimeError(f"火山 TTS 返回音频过短（{len(audio)} 字节）")

    cached.write_bytes(audio)
    try:
        budget.add_tts(len(text))
    except Exception:
        pass
    log.info("tts ok: %d bytes, %d chars", len(audio), len(text))
    return audio
