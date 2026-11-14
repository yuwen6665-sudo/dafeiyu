"""OpenAI 兼容接口：DeepSeek / 通义千问 / Kimi / 智谱 / Ollama / vLLM / LM Studio …"""
from __future__ import annotations

import json
import os
import threading
from typing import Iterator

import requests

from . import Brain
from .. import budget
from ..protocol import PERSONA


class OpenAICompatBrain(Brain):
    kind = "openai"

    def _system(self) -> str:
        c = self.conf
        # system_file：直接拿角色卡文件当 system prompt（改文件即生效，不用重启）
        path = c.get("system_file")
        if path:
            try:
                with open(path, encoding="utf-8") as f:
                    return f.read()
            except OSError:
                pass
        return c.get("system", PERSONA)

    def stream(self, prompt: str, history: list[dict], cancel: threading.Event) -> Iterator[str]:
        c = self.conf
        key = os.environ.get(c.get("api_key_env", ""), "") or c.get("api_key", "")
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        messages = [{"role": "system", "content": self._system()}, *history,
                    {"role": "user", "content": prompt}]
        body = {"model": c["model"], "messages": messages, "stream": True, **c.get("extra", {})}
        if budget.degraded():
            # 到月度上限：压缩输出长度（省钱模式）
            try:
                body["max_tokens"] = min(int(body.get("max_tokens") or 120), 120)
            except (TypeError, ValueError):
                body["max_tokens"] = 120
        url = c.get("base_url", "https://api.deepseek.com").rstrip("/") + "/chat/completions"

        with requests.post(url, headers=headers, json=body, stream=True,
                           timeout=(10, c.get("timeout", 120))) as r:
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}: {r.content.decode('utf-8', 'ignore')[:300]}")
            for raw in r.iter_lines():
                if cancel.is_set():
                    return
                if not raw or not raw.startswith(b"data:"):
                    continue
                data = raw[5:].strip()
                if data == b"[DONE]":
                    return
                try:
                    choices = json.loads(data).get("choices") or [{}]
                except ValueError:
                    continue
                text = (choices[0].get("delta") or {}).get("content")
                if text:
                    yield text
