"""Regulatory Collector — Companies House (UK) and SEC EDGAR filings."""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

import feedparser
import requests
from sqlalchemy.orm import Session

from app.models import Entity, RawItem

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "IntelligentMonitor/1.0 (personal home server)"}

# SEC EDGAR — recent 8-K filings (material events)
SEC_8K_FEED = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=40&output=atom"

# Companies House (UK) — free search API, no auth needed for basic queries
CH_SEARCH_URL = "https://api.company-information.service.gov.uk/search/companies"

RATE_DELAY = 1.5


def _hash(url: str, title: str) -> str:
    return hashlib.sha256(f"{url}|{title}".encode()).hexdigest()


def collect_sec(db: Session) -> int:
    new_count = 0
    try:
        parsed = feedparser.parse(SEC_8K_FEED, request_headers=HEADERS)
    except Exception as exc:
        logger.warning("SEC feed error: %s", exc)
        return 0

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

        db.add(RawItem(
            source_url=link,
            source_type="regulatory",
            title=title,
            content=summary,
            published_at=published_at,
            content_hash=c_hash,
        ))
        new_count += 1

    db.commit()
    return new_count


def collect_companies_house(db: Session, entities: List[Entity]) -> int:
    """Search Companies House for filings related to tracked companies."""
    new_count = 0
    for entity in entities:
        if entity.type != "company":
            continue

        try:
            resp = requests.get(
                CH_SEARCH_URL,
                params={"q": entity.name, "items_per_page": 5},
                headers=HEADERS,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Companies House search failed for %s: %s", entity.name, exc)
            time.sleep(RATE_DELAY)
            continue

        for item in data.get("items", []):
            company_number = item.get("company_number", "")
            company_name = item.get("title", entity.name)
            status = item.get("company_status", "")
            title = f"[Companies House] {company_name} — status: {status}"
            link = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}"

            c_hash = _hash(link, title)
            if db.query(RawItem).filter(RawItem.content_hash == c_hash).first():
                continue

            db.add(RawItem(
                source_url=link,
                source_type="regulatory",
                title=title,
                content=str(item),
                content_hash=c_hash,
            ))
            new_count += 1

        time.sleep(RATE_DELAY)

    db.commit()
    logger.info("Regulatory collector stored %d new items", new_count)
    return new_count


def collect_regulatory(db: Session, entities: List[Entity]) -> int:
    total = collect_sec(db)
    total += collect_companies_house(db, entities)
    return total
