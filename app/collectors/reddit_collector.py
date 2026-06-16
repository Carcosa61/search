"""Reddit Collector — monitors public subreddits via the JSON API (no auth required)."""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import List

import requests
from sqlalchemy.orm import Session

from app.models import Entity, RawItem

logger = logging.getLogger(__name__)

REDDIT_BASE = "https://www.reddit.com"
HEADERS = {"User-Agent": "IntelligentMonitor/1.0 (personal home server)"}
RATE_DELAY = 2.0  # seconds between requests


def _hash(url: str, title: str) -> str:
    return hashlib.sha256(f"{url}|{title}".encode()).hexdigest()


def _relevant_subreddits(entity: Entity) -> List[str]:
    """Derive subreddits to check based on entity type and keywords."""
    base = ["worldnews", "news"]
    if entity.type == "company":
        base += ["investing", "stocks", "ukpersonalfinance", "wallstreetbets"]
    elif entity.type == "music":
        base += ["music", "metal", "jpop", "jrock", "worldmusic"]
    elif entity.type == "person":
        base += ["celebrity", "AMA"]
    elif entity.type == "topic":
        base += ["technology", "science", "economics"]
    return base


def collect_reddit(db: Session, entities: List[Entity]) -> int:
    new_count = 0
    visited: set[str] = set()

    for entity in entities:
        for subreddit in _relevant_subreddits(entity):
            for keyword in entity.keywords[:3]:  # cap per entity to avoid hammering
                url = f"{REDDIT_BASE}/r/{subreddit}/search.json"
                params = {"q": keyword, "sort": "new", "limit": 25, "restrict_sr": "true", "t": "week"}
                cache_key = f"{subreddit}:{keyword}"
                if cache_key in visited:
                    continue
                visited.add(cache_key)

                try:
                    resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as exc:
                    logger.warning("Reddit request failed (%s): %s", cache_key, exc)
                    time.sleep(RATE_DELAY)
                    continue

                for post in data.get("data", {}).get("children", []):
                    d = post.get("data", {})
                    title = d.get("title", "")
                    link = f"{REDDIT_BASE}{d.get('permalink', '')}"
                    content = d.get("selftext", "") or d.get("url", "")
                    created_utc = d.get("created_utc")
                    published_at = (
                        datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None
                    )
                    c_hash = _hash(link, title)

                    if db.query(RawItem).filter(RawItem.content_hash == c_hash).first():
                        continue

                    db.add(RawItem(
                        source_url=link,
                        source_type="reddit",
                        title=title,
                        content=content,
                        published_at=published_at,
                        content_hash=c_hash,
                    ))
                    new_count += 1

                time.sleep(RATE_DELAY)

    db.commit()
    logger.info("Reddit collector stored %d new items", new_count)
    return new_count
