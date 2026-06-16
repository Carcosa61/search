"""Entity matching — maps raw items to tracked entities via keyword and embedding similarity."""
from __future__ import annotations

import logging
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models import Entity, RawItem

logger = logging.getLogger(__name__)

KEYWORD_MATCH_SCORE = 1.0
RELATED_MATCH_SCORE = 0.6
MIN_MATCH_SCORE = 0.4


def _text_lower(item: RawItem) -> str:
    return f"{item.title or ''} {item.content or ''}".lower()


def match_item_to_entities(
    item: RawItem,
    entities: List[Entity],
) -> List[Tuple[Entity, float]]:
    """
    Returns a list of (entity, match_score) for all entities that match the item.
    Score is cumulative — multiple keywords increase the score.
    """
    text = _text_lower(item)
    matches: List[Tuple[Entity, float]] = []

    for entity in entities:
        if not entity.is_active:
            continue

        score = 0.0

        # Direct name match
        if entity.name.lower() in text:
            score += 2.0

        # Keyword matches
        for kw in (entity.keywords or []):
            if kw.lower() in text:
                score += KEYWORD_MATCH_SCORE

        # Related entity matches
        for rel in (entity.related_entities or []):
            if rel.lower() in text:
                score += RELATED_MATCH_SCORE

        if score >= MIN_MATCH_SCORE:
            matches.append((entity, score))

    return sorted(matches, key=lambda t: t[1], reverse=True)


def match_all_unprocessed(db: Session) -> dict[int, List[Tuple[int, float]]]:
    """
    Match all unprocessed (non-duplicate) raw items to entities.
    Returns {raw_item_id: [(entity_id, score), ...]}
    """
    items: List[RawItem] = (
        db.query(RawItem)
        .filter(RawItem.is_processed == False)  # noqa: E712
        .all()
    )
    entities: List[Entity] = db.query(Entity).filter(Entity.is_active == True).all()  # noqa: E712

    result: dict[int, List[Tuple[int, float]]] = {}
    for item in items:
        matched = match_item_to_entities(item, entities)
        if matched:
            result[item.id] = [(e.id, s) for e, s in matched]

    logger.info("Matched %d items to entities", len(result))
    return result
