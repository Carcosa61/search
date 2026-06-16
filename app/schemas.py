from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, field_validator
from app.models import EntityType, Priority, UpdateFrequency


# ── Entity ──────────────────────────────────────────────────────────────────

class EntityCreate(BaseModel):
    name: str
    type: EntityType
    keywords: List[str]
    related_entities: Optional[List[str]] = None
    priority: Priority = Priority.medium
    update_frequency: UpdateFrequency = UpdateFrequency.daily
    alert_threshold: int = 50
    allowed_sources: Optional[List[str]] = None

    @field_validator("alert_threshold")
    @classmethod
    def threshold_range(cls, v: int) -> int:
        if not (0 <= v <= 100):
            raise ValueError("alert_threshold must be between 0 and 100")
        return v


class EntityUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[List[str]] = None
    related_entities: Optional[List[str]] = None
    priority: Optional[Priority] = None
    update_frequency: Optional[UpdateFrequency] = None
    alert_threshold: Optional[int] = None
    allowed_sources: Optional[List[str]] = None
    is_active: Optional[bool] = None


class EntityOut(BaseModel):
    id: int
    name: str
    type: EntityType
    keywords: List[str]
    related_entities: Optional[List[str]]
    priority: Priority
    update_frequency: UpdateFrequency
    alert_threshold: int
    allowed_sources: Optional[List[str]]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Insight ──────────────────────────────────────────────────────────────────

class InsightOut(BaseModel):
    id: int
    entity_id: int
    title: str
    summary: Optional[str]
    event_type: Optional[str]
    impact: Optional[str]
    relevance_score: float
    importance_score: float
    recency_score: float
    source_trust_score: float
    final_score: float
    source_urls: Optional[List[str]]
    source_count: int
    published_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Alert ──────────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    id: int
    entity_id: int
    insight_id: Optional[int]
    message: str
    trigger_reason: str
    is_sent: bool
    created_at: datetime
    sent_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Dashboard ──────────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_entities: int
    active_entities: int
    total_insights_today: int
    unread_alerts: int
    top_insights: List[InsightOut]
