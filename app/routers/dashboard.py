from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert, Entity, Insight
from app.schemas import AlertOut, DashboardSummary, InsightOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummary)
def get_dashboard(db: Session = Depends(get_db)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total_entities = db.query(func.count(Entity.id)).scalar()
    active_entities = db.query(func.count(Entity.id)).filter(Entity.is_active == True).scalar()  # noqa: E712
    total_insights_today = (
        db.query(func.count(Insight.id))
        .filter(Insight.created_at >= today_start)
        .scalar()
    )
    unread_alerts = db.query(func.count(Alert.id)).filter(Alert.is_sent == False).scalar()  # noqa: E712

    top_insights = (
        db.query(Insight)
        .order_by(Insight.final_score.desc(), Insight.created_at.desc())
        .limit(10)
        .all()
    )

    return DashboardSummary(
        total_entities=total_entities,
        active_entities=active_entities,
        total_insights_today=total_insights_today,
        unread_alerts=unread_alerts,
        top_insights=[InsightOut.model_validate(i) for i in top_insights],
    )


@router.get("/insights", response_model=List[InsightOut])
def list_insights(
    entity_id: Optional[int] = Query(None),
    source_type: Optional[str] = Query(None),
    min_score: float = Query(0.0, ge=0, le=100),
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = db.query(Insight).filter(Insight.created_at >= since, Insight.final_score >= min_score)
    if entity_id:
        q = q.filter(Insight.entity_id == entity_id)
    return q.order_by(Insight.final_score.desc(), Insight.created_at.desc()).limit(limit).all()
