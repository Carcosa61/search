"""Relevance scoring — produces the four sub-scores and a weighted final score."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.models import RawItem

# Source trust weights
SOURCE_TRUST: dict[str, float] = {
    "rss": 70.0,
    "reddit": 40.0,
    "youtube": 50.0,
    "regulatory": 95.0,
    "web": 55.0,
}

# Score weights (must sum to 1.0)
WEIGHTS = {
    "relevance": 0.35,
    "importance": 0.30,
    "recency": 0.20,
    "source_trust": 0.15,
}

# Importance signals — title keywords that bump importance
IMPORTANCE_SIGNALS = [
    "filing", "acquisition", "merger", "bankruptcy", "announced", "tour",
    "album", "ipo", "lawsuit", "regulatory", "earnings", "quarterly",
    "investigation", "breach", "partnership", "funding", "raises",
]


def compute_recency_score(published_at: Optional[datetime]) -> float:
    """Linear decay: 100 if published now, 0 at 30 days old."""
    if not published_at:
        return 30.0
    now = datetime.now(timezone.utc)
    age_hours = (now - published_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600
    score = max(0.0, 100.0 - (age_hours / (30 * 24)) * 100.0)
    return round(score, 2)


def compute_importance_score(title: str, content: str) -> float:
    text = f"{title} {content}".lower()
    hits = sum(1 for sig in IMPORTANCE_SIGNALS if sig in text)
    return min(100.0, hits * 20.0)


def compute_relevance_score(entity_match_score: float) -> float:
    """Convert raw match score (keyword hit count) into 0-100."""
    return min(100.0, entity_match_score * 15.0)


def score_item(
    item: RawItem,
    entity_match_score: float,
) -> dict[str, float]:
    relevance = compute_relevance_score(entity_match_score)
    importance = compute_importance_score(item.title or "", item.content or "")
    recency = compute_recency_score(item.published_at)
    source_trust = SOURCE_TRUST.get(item.source_type, 50.0)

    final = (
        relevance * WEIGHTS["relevance"]
        + importance * WEIGHTS["importance"]
        + recency * WEIGHTS["recency"]
        + source_trust * WEIGHTS["source_trust"]
    )

    return {
        "relevance_score": round(relevance, 2),
        "importance_score": round(importance, 2),
        "recency_score": round(recency, 2),
        "source_trust_score": round(source_trust, 2),
        "final_score": round(final, 2),
    }
