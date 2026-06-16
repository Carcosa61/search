from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Entity
from app.schemas import EntityCreate, EntityOut, EntityUpdate

router = APIRouter(prefix="/entity", tags=["entities"])


@router.post("", response_model=EntityOut, status_code=201)
def create_entity(payload: EntityCreate, db: Session = Depends(get_db)):
    entity = Entity(**payload.model_dump())
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


@router.get("", response_model=List[EntityOut])
def list_entities(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    q = db.query(Entity)
    if active_only:
        q = q.filter(Entity.is_active == True)  # noqa: E712
    return q.order_by(Entity.name).all()


@router.get("/{entity_id}", response_model=EntityOut)
def get_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.patch("/{entity_id}", response_model=EntityOut)
def update_entity(entity_id: int, payload: EntityUpdate, db: Session = Depends(get_db)):
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(entity, field, value)
    entity.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(entity)
    return entity


@router.delete("/{entity_id}", status_code=204)
def delete_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    db.delete(entity)
    db.commit()
