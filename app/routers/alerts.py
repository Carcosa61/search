from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert
from app.schemas import AlertOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=List[AlertOut])
def list_alerts(
    entity_id: Optional[int] = Query(None),
    unsent_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Alert)
    if entity_id:
        q = q.filter(Alert.entity_id == entity_id)
    if unsent_only:
        q = q.filter(Alert.is_sent == False)  # noqa: E712
    return q.order_by(Alert.created_at.desc()).limit(limit).all()


@router.post("/{alert_id}/mark-sent", response_model=AlertOut)
def mark_alert_sent(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_sent = True
    alert.sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(alert)
    return alert
