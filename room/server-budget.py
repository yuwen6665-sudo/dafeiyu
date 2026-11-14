"""月度预算台账 + 熔断。

记账口径（估算，够用即可）：
  · LLM：按字符估算 token（中文约 1 字 ≈ 1.5 token 的保守反推），输入/输出分别计价
  · TTS：按合成字符数（缓存命中不计费）
  · ASR：按音频时长（秒）

阈值：
  · >= 50 元 → degrade：关掉语音、回复压短
  · >= 60 元 → stop：不再调用云端，只回本地短句
月底自动归零（按本地月份）。
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import pathlib
import threading

log = logging.getLogger("yuyaya.budget")

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
CACHE.mkdir(parents=True, exist_ok=True)
LEDGER = CACHE / "budget.json"

# 单价（元）
PRICE_LLM_IN_PER_M = 2.0      # DeepSeek 输入：2 元/百万 token
PRICE_LLM_OUT_PER_M = 8.0     # DeepSeek 输出：8 元/百万 token
PRICE_TTS_PER_KCHAR = 0.3     # 火山复刻 3 元/万字符 = 0.3 元/千字符
PRICE_ASR_PER_HOUR = 1.0      # 1 元/小时

DEGRADE_AT = 50.0
STOP_AT = 60.0

_LOCK = threading.Lock()
_EMPTY = {
    "month": "",
    "llm_in_tokens": 0,
    "llm_out_tokens": 0,
    "tts_chars": 0,
    "asr_seconds": 0.0,
}


def _month() -> str:
    return _dt.datetime.now().strftime("%Y-%m")


def _load() -> dict:
    try:
        data = json.loads(LEDGER.read_text(encoding="utf-8-sig"))   # 容忍 BOM
    except Exception:
        data = dict(_EMPTY)
    for k, v in _EMPTY.items():
        data.setdefault(k, v)
    if data.get("month") != _month():
        data = dict(_EMPTY, month=_month())
    return data


def _save(data: dict) -> None:
    try:
        LEDGER.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")  # 无 BOM
    except OSError as exc:
        log.warning("写入台账失败: %s", exc)


def _cost(d: dict) -> float:
    return (
        d["llm_in_tokens"] / 1_000_000 * PRICE_LLM_IN_PER_M
        + d["llm_out_tokens"] / 1_000_000 * PRICE_LLM_OUT_PER_M
        + d["tts_chars"] / 1000 * PRICE_TTS_PER_KCHAR
        + d["asr_seconds"] / 3600 * PRICE_ASR_PER_HOUR
    )


def add_llm(prompt_chars: int, reply_chars: int) -> None:
    """按字符估 token（1 token ≈ 1.5 汉字，保守取 1.5）。"""
    if prompt_chars <= 0 and reply_chars <= 0:
        return
    with _LOCK:
        d = _load()
        d["llm_in_tokens"] += int(prompt_chars / 1.5)
        d["llm_out_tokens"] += int(reply_chars / 1.5)
        _save(d)


def add_tts(chars: int) -> None:
    if chars <= 0:
        return
    with _LOCK:
        d = _load()
        d["tts_chars"] += int(chars)
        _save(d)


def add_asr(seconds: float) -> None:
    if seconds <= 0:
        return
    with _LOCK:
        d = _load()
        d["asr_seconds"] += round(float(seconds), 2)
        _save(d)


def snapshot() -> dict:
    with _LOCK:
        d = _load()
    total = _cost(d)
    level = "stop" if total >= STOP_AT else "degrade" if total >= DEGRADE_AT else "normal"
    return {
        "month": d["month"],
        "total": round(total, 4),
        "level": level,
        "degrade_at": DEGRADE_AT,
        "stop_at": STOP_AT,
        "llm_in_tokens": d["llm_in_tokens"],
        "llm_out_tokens": d["llm_out_tokens"],
        "tts_chars": d["tts_chars"],
        "asr_seconds": d["asr_seconds"],
    }


def level() -> str:
    return snapshot()["level"]


def degraded() -> bool:
    return level() != "normal"
