"""Web scraper — fetches public pages using httpx + BeautifulSoup with rate limiting.

Playwright is used only if a domain is flagged as requiring JS rendering.
"""
from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.models import Entity, RawItem

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "IntelligentMonitor/1.0 (personal home server; not for commercial use)"
}
RATE_LIMIT = 1.5        # seconds between requests to the same domain
MAX_CONTENT_LEN = 8_000  # truncate body to avoid huge DB rows

_last_request_time: dict[str, float] = defaultdict(float)


def _throttle(domain: str) -> None:
    elapsed = time.time() - _last_request_time[domain]
    if elapsed < RATE_LIMIT:
        time.sleep(RATE_LIMIT - elapsed)
    _last_request_time[domain] = time.time()


def _hash(url: str, content_snippet: str) -> str:
    return hashlib.sha256(f"{url}|{content_snippet[:200]}".encode()).hexdigest()


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return " ".join(soup.get_text(separator=" ").split())[:MAX_CONTENT_LEN]


def scrape_url(url: str) -> Optional[str]:
    domain = urlparse(url).netloc
    _throttle(domain)
    try:
        with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=20) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return _extract_text(resp.text)
    except Exception as exc:
        logger.warning("Scrape failed for %s: %s", url, exc)
        return None


def collect_web(db: Session, entities: List[Entity]) -> int:
    """Scrape entity-specific public pages (press pages, official sites)."""
    new_count = 0

    for entity in entities:
        # Build target URLs from entity keywords/name
        search_query = "+".join(entity.keywords[:2])
        # Use a news aggregator search page as a lightweight stand-in for crawling
        target_url = f"https://news.google.com/search?q={search_query}&hl=en"

        content = scrape_url(target_url)
        if not content:
            continue

        title = f"[Web] {entity.name} — scraped results"
        c_hash = _hash(target_url, content)

        if db.query(RawItem).filter(RawItem.content_hash == c_hash).first():
            continue

        db.add(RawItem(
            source_url=target_url,
            source_type="web",
            title=title,
            content=content,
            published_at=datetime.now(timezone.utc),
            content_hash=c_hash,
        ))
        new_count += 1

    db.commit()
    logger.info("Web scraper stored %d new items", new_count)
    return new_count
