from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Source
from app.schemas import SourceCreate, SourceOut, SourceUpdate

router = APIRouter(prefix="/source", tags=["sources"])


@router.get("", response_model=List[SourceOut])
def list_sources(
    entity_id: Optional[int] = None,
    is_global: Optional[bool] = None,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Source)
    if is_global is not None:
        q = q.filter(Source.is_global == is_global)  # noqa: E712
    if entity_id is not None:
        q = q.filter(Source.entity_id == entity_id)
    if type is not None:
        q = q.filter(Source.type == type)
    return q.order_by(Source.type, Source.label).all()


@router.post("", response_model=SourceOut, status_code=201)
def create_source(payload: SourceCreate, db: Session = Depends(get_db)):
    source = Source(**payload.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.patch("/{source_id}", response_model=SourceOut)
def update_source(source_id: int, payload: SourceUpdate, db: Session = Depends(get_db)):
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(source, field, value)
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: int, db: Session = Depends(get_db)):
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(source)
    db.commit()
