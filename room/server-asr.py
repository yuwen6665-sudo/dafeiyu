"""语音识别（ASR）—— 火山引擎「极速版」一句话识别。

前端按住说话 → 录音（ogg/opus）→ POST /api/asr → 这里转文字 → 前端自动发送。

凭证沿用 TTS 的：VOLC_TTS_APPID / VOLC_TTS_TOKEN。
资源 ID 默认 volc.bigasr.auc_turbo，可用 VOLC_ASR_RESOURCE 覆盖。

注意：这个接口需要在火山控制台**开通「语音识别 · 大模型/极速版」**，
否则会返回 45000030 requested resource not granted；本模块会把这条错误翻译成人话。
"""
from __future__ import annotations

import base64
import json
import logging
import os
import uuid

import requests

log = logging.getLogger("yuyaya.asr")

ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
RESOURCES = [
    os.environ.get("VOLC_ASR_RESOURCE") or "",
    "volc.bigasr.auc_turbo",
    "volc.bigasr.auc",
]
RESOURCES = [r for i, r in enumerate(RESOURCES) if r and r not in RESOURCES[:i]]


def _creds() -> tuple[str, str]:
    try:
        from .tts import creds as tts_creds
        appid, token, _ = tts_creds()
        return appid, token
    except Exception:
        return os.environ.get("VOLC_TTS_APPID", ""), os.environ.get("VOLC_TTS_TOKEN", "")


def _pick_text(obj: dict) -> tuple[str, float]:
    text = ""
    dur = 0.0
    result = obj.get("result") or obj.get("resp") or {}
    if isinstance(result, dict):
        text = result.get("text") or ""
        if not text:
            utts = result.get("utterances") or []
            if utts and isinstance(utts[0], dict):
                text = utts[0].get("text") or ""
        info = result.get("audio_info") or obj.get("audio_info") or {}
        if isinstance(info, dict):
            try:
                dur = float(info.get("duration") or 0) / 1000.0
            except (TypeError, ValueError):
                dur = 0.0
    if not text:
        text = obj.get("text") or ""
    return text.strip(), dur


def _friendly(code, message: str, resource: str) -> str:
    if code == 45000030:
        return (f"火山语音识别未开通（resource={resource}）。"
                "去控制台开通「语音识别 · 大模型/极速版」后就能用按住说话了。")
    return f"code={code} {message}"


def recognize(audio: bytes, fmt: str = "ogg") -> dict:
    """返回 {"text": ..., "duration": 秒}；失败抛异常（信息可直接展示）。"""
    if not audio or len(audio) < 400:
        raise ValueError("音频太短")
    appid, token = _creds()
    if not appid or not token:
        raise RuntimeError("缺少火山凭证（VOLC_TTS_APPID / VOLC_TTS_TOKEN）")

    payload = {
        "user": {"uid": "yuyaya"},
        "audio": {"format": fmt, "data": base64.b64encode(audio).decode("ascii")},
        "request": {"model_name": "bigmodel", "enable_itn": True, "show_utterances": False},
    }
    errors: list[str] = []
    for res in RESOURCES:
        headers = {
            "Content-Type": "application/json",
            "X-Api-App-Key": appid,
            "X-Api-Access-Key": token,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "X-Api-Resource-Id": res,
        }
        try:
            r = requests.post(ENDPOINT, headers=headers, data=json.dumps(payload), timeout=60)
        except Exception as exc:
            errors.append(f"{res}: {exc}")
            continue

        try:
            obj = r.json()
        except ValueError:
            errors.append(f"{res}: HTTP {r.status_code} 非 JSON: {r.text[:160]}")
            continue

        header = obj.get("header") or {}
        code = header.get("code", obj.get("code"))
        if code not in (None, 0, 20000000):
            errors.append(_friendly(code, header.get("message") or obj.get("message", ""), res))
            continue

        text, dur = _pick_text(obj)
        if not text:
            errors.append(f"{res}: 未识别到文本 {str(obj)[:160]}")
            continue
        log.info("asr ok: %d chars, %.1fs, resource=%s", len(text), dur, res)
        return {"text": text, "duration": dur}

    # 去重后抛给前端
    seen: list[str] = []
    for e in errors:
        if e not in seen:
            seen.append(e)
    raise RuntimeError("ASR 失败：" + "；".join(seen[:2]))
