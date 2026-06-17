"""YouTube Collector — monitors channel RSS feeds and searches via yt-dlp metadata (no API key needed)."""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Optional

import feedparser
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Entity, RawItem

logger = logging.getLogger(__name__)

YT_CHANNEL_RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
HEADERS = {"User-Agent": "IntelligentMonitor/1.0"}


def _hash(url: str, title: str) -> str:
    return hashlib.sha256(f"{url}|{title}".encode()).hexdigest()


# Map known entities to YouTube channel IDs; users can extend this
ENTITY_CHANNEL_MAP: dict[str, List[str]] = {
    "nemophila": ["UCrY87RDPtYEQiMsRmYkHMpA"],
    "saki": ["UCrY87RDPtYEQiMsRmYkHMpA"],  # same channel for the band
}


def collect_youtube(db: Session, entities: List[Entity]) -> int:
    new_count = 0

    for entity in entities:
        name_lower = entity.name.lower()
        channel_ids = ENTITY_CHANNEL_MAP.get(name_lower, [])

        for channel_id in channel_ids:
            feed_url = YT_CHANNEL_RSS.format(channel_id=channel_id)
            try:
                parsed = feedparser.parse(feed_url, request_headers=HEADERS)
            except Exception as exc:
                logger.warning("YouTube feed error for channel %s: %s", channel_id, exc)
                continue

            for entry in parsed.entries:
                title = entry.get("title", "")
                link = entry.get("link", "")
                summary = entry.get("summary", "")
                published_raw = entry.get("published_parsed")
                published_at: Optional[datetime] = None
                if published_raw:
                    try:
                        published_at = datetime(*published_raw[:6], tzinfo=timezone.utc)
                    except Exception:
                        pass

                c_hash = _hash(link, title)
                if db.query(RawItem).filter(RawItem.content_hash == c_hash).first():
                    continue

                try:
                    db.add(RawItem(
                        source_url=link,
                        source_type="youtube",
                        title=title,
                        content=summary,
                        published_at=published_at,
                        content_hash=c_hash,
                    ))
                    db.commit()
                    new_count += 1
                except IntegrityError:
                    db.rollback()

    logger.info("YouTube collector stored %d new items", new_count)
    return new_count
