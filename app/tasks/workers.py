"""Worker — RQ worker that processes jobs from the Redis queue."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Tuple

import redis
from rq import Queue, Worker
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import Alert, Entity, Insight, RawItem
from app.collectors import rss_collector, reddit_collector, youtube_collector, regulatory_collector, web_scraper
from app.processing import deduplication, entity_matching, relevance_scoring, ai_summarisation

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

settings = get_settings()
redis_conn = redis.from_url(settings.redis_url)
q = Queue("default", connection=redis_conn)


# ─── Core pipeline ────────────────────────────────────────────────────────────

def run_collection_pipeline() -> None:
    """Full crawl + process + alert cycle. Called by the scheduler."""
    db: Session = SessionLocal()
    try:
        entities: List[Entity] = db.query(Entity).filter(Entity.is_active == True).all()  # noqa: E712

        # 1. Collect
        rss_collector.collect_feeds(db)
        reddit_collector.collect_reddit(db, entities)
        youtube_collector.collect_youtube(db, entities)
        regulatory_collector.collect_regulatory(db, entities)
        web_scraper.collect_web(db, entities)

        # 2. Deduplicate
        deduplication.deduplicate_unprocessed(db)

        # 3. Match → score → summarise → store insights
        matches: dict[int, List[Tuple[int, float]]] = entity_matching.match_all_unprocessed(db)

        for raw_id, entity_matches in matches.items():
            item: RawItem = db.query(RawItem).get(raw_id)
            if not item or item.is_processed:
                continue

            for entity_id, match_score in entity_matches[:3]:  # top 3 entities per item
                entity: Entity = db.query(Entity).get(entity_id)
                if not entity:
                    continue

                scores = relevance_scoring.score_item(item, match_score)
                summary_data = ai_summarisation.summarise(
                    item.title or "", item.content or "", entity.name
                )

                insight = Insight(
                    entity_id=entity_id,
                    title=item.title or summary_data.get("summary", "")[:255],
                    summary=summary_data.get("summary"),
                    event_type=summary_data.get("event_type"),
                    impact=summary_data.get("impact"),
                    source_urls=[item.source_url],
                    source_count=1,
                    published_at=item.published_at,
                    raw_item_ids=[raw_id],
                    **scores,
                )
                db.add(insight)
                db.flush()

                # 4. Alert if score exceeds entity threshold
                if scores["final_score"] >= entity.alert_threshold:
                    alert = Alert(
                        entity_id=entity_id,
                        insight_id=insight.id,
                        message=f"[{entity.name}] {item.title} (score: {scores['final_score']:.0f})",
                        trigger_reason="score_threshold",
                    )
                    db.add(alert)

            item.is_processed = True

        db.commit()
        logger.info("Pipeline complete. Processed %d items.", len(matches))

    except Exception as exc:
        db.rollback()
        logger.exception("Pipeline error: %s", exc)
    finally:
        db.close()


def enqueue_refresh() -> None:
    q.enqueue(run_collection_pipeline, job_timeout=600)


# ─── RQ worker entrypoint ────────────────────────────────────────────────────

if __name__ == "__main__":
    with Worker(queues=[q], connection=redis_conn) as worker:
        worker.work(with_scheduler=False)
