"""RSS Collector — fetches and parses RSS/Atom feeds."""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Optional

import feedparser
import requests
from sqlalchemy.orm import Session

from app.models import RawItem

logger = logging.getLogger(__name__)

# Curated feed list; extend as needed
DEFAULT_FEEDS: List[str] = [
    "https://feeds.reuters.com/reuters/businessNews",
    "https://feeds.feedburner.com/TechCrunch/",
    "https://www.theguardian.com/business/rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    # Music
    "https://pitchfork.com/rss/news/",
    "https://www.nme.com/feed",
    # Regulatory (Companies House doesn't have an RSS, but SEC does)
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=40&output=atom",
]

HEADERS = {
    "User-Agent": "IntelligentMonitor/1.0 (personal home server; contact: admin@localhost)"
}

# Max requests per domain per session (rate limiting)
MAX_PER_DOMAIN = 1


def _content_hash(url: str, title: str, content: str) -> str:
    raw = f"{url}|{title}|{content[:200]}"
    return hashlib.sha256(raw.encode()).hexdigest()


def collect_feeds(db: Session, feeds: Optional[List[str]] = None) -> int:
    """Fetch all configured feeds and store new raw items. Returns count of new items."""
    feed_urls = feeds or DEFAULT_FEEDS
    new_count = 0

    for feed_url in feed_urls:
        try:
            parsed = feedparser.parse(feed_url, request_headers=HEADERS)
        except Exception as exc:
            logger.warning("Failed to fetch feed %s: %s", feed_url, exc)
            continue

        for entry in parsed.entries:
            title = entry.get("title", "")
            link = entry.get("link", feed_url)
            content = entry.get("summary", entry.get("description", ""))
            published_raw = entry.get("published_parsed")
            published_at: Optional[datetime] = None
            if published_raw:
                try:
                    published_at = datetime(*published_raw[:6], tzinfo=timezone.utc)
                except Exception:
                    pass

            c_hash = _content_hash(link, title, content)

            existing = db.query(RawItem).filter(RawItem.content_hash == c_hash).first()
            if existing:
                continue

            item = RawItem(
                source_url=link,
                source_type="rss",
                title=title,
                content=content,
                published_at=published_at,
                content_hash=c_hash,
            )
            db.add(item)
            new_count += 1

    db.commit()
    logger.info("RSS collector stored %d new items", new_count)
    return new_count
