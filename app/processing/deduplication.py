"""Deduplication engine — marks near-duplicate RawItems before processing."""
from __future__ import annotations

import logging
from typing import List

from sqlalchemy.orm import Session

from app.models import RawItem

logger = logging.getLogger(__name__)


def _title_tokens(title: str) -> set[str]:
    stopwords = {"the", "a", "an", "is", "in", "of", "for", "and", "to", "at", "on", "with"}
    return {w.lower() for w in title.split() if len(w) > 2 and w.lower() not in stopwords}


def jaccard_similarity(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


SIMILARITY_THRESHOLD = 0.6


def deduplicate_unprocessed(db: Session) -> int:
    """
    For each unprocessed RawItem, compare title tokens against already-processed items.
    If similarity exceeds threshold, mark as processed (skip) without creating an Insight.
    Returns count of items marked as duplicates.
    """
    unprocessed: List[RawItem] = (
        db.query(RawItem)
        .filter(RawItem.is_processed == False)  # noqa: E712
        .order_by(RawItem.collected_at.asc())
        .all()
    )

    # Build reference set from recently processed items (last 500)
    processed_titles: List[set] = [
        _title_tokens(r.title or "")
        for r in db.query(RawItem)
        .filter(RawItem.is_processed == True)  # noqa: E712
        .order_by(RawItem.collected_at.desc())
        .limit(500)
        .all()
    ]

    dup_count = 0
    seen_in_batch: List[set] = []

    for item in unprocessed:
        tokens = _title_tokens(item.title or "")

        # Check against already-processed
        is_dup = any(jaccard_similarity(tokens, ref) >= SIMILARITY_THRESHOLD for ref in processed_titles)

        # Check against others in this batch
        if not is_dup:
            is_dup = any(jaccard_similarity(tokens, ref) >= SIMILARITY_THRESHOLD for ref in seen_in_batch)

        if is_dup:
            item.is_processed = True  # skip without creating insight
            dup_count += 1
        else:
            seen_in_batch.append(tokens)

    db.commit()
    logger.info("Deduplication flagged %d duplicates out of %d", dup_count, len(unprocessed))
    return dup_count
