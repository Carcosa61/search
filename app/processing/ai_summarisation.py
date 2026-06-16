"""AI Summarisation — calls OpenAI or falls back to a local Ollama LLM."""
from __future__ import annotations

import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an intelligence analyst. "
    "Given a news article or web content about a tracked entity, "
    "produce a structured summary in the following JSON format:\n"
    '{"event_type": "<short label>", "impact": "Low|Medium|High", '
    '"summary": "<2-3 sentence summary>"}\n'
    "Reply ONLY with the JSON object."
)


def _summarise_openai(text: str, entity_name: str) -> Optional[dict]:
    import json
    try:
        from openai import OpenAI  # type: ignore
        settings = get_settings()
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Entity: {entity_name}\n\n{text[:2000]}"},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        raw = response.choices[0].message.content or "{}"
        return json.loads(raw)
    except Exception as exc:
        logger.warning("OpenAI summarisation failed: %s", exc)
        return None


def _summarise_ollama(text: str, entity_name: str) -> Optional[dict]:
    import json
    import requests
    settings = get_settings()
    try:
        resp = requests.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": "llama3",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Entity: {entity_name}\n\n{text[:2000]}"},
                ],
                "stream": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json().get("message", {}).get("content", "{}")
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Ollama summarisation failed: %s", exc)
        return None


def _fallback_summary(title: str) -> dict:
    return {
        "event_type": "Update",
        "impact": "Unknown",
        "summary": title,
    }


def summarise(title: str, content: str, entity_name: str) -> dict:
    """
    Returns {"event_type", "impact", "summary"}.
    Tries OpenAI first, falls back to Ollama, then a plain-text fallback.
    """
    settings = get_settings()
    text = f"{title}\n\n{content}"

    if settings.openai_api_key:
        result = _summarise_openai(text, entity_name)
        if result:
            return result

    result = _summarise_ollama(text, entity_name)
    if result:
        return result

    return _fallback_summary(title)
