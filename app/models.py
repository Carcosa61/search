from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Enum,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class EntityType(str, enum.Enum):
    company = "company"
    music = "music"
    person = "person"
    topic = "topic"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class UpdateFrequency(str, enum.Enum):
    hourly = "hourly"
    daily = "daily"
    weekly = "weekly"


class Entity(Base):
    __tablename__ = "entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum(EntityType), nullable=False)
    keywords = Column(ARRAY(String), nullable=False, default=list)
    related_entities = Column(ARRAY(String), nullable=True)
    priority = Column(Enum(Priority), nullable=False, default=Priority.medium)
    update_frequency = Column(Enum(UpdateFrequency), nullable=False, default=UpdateFrequency.daily)
    alert_threshold = Column(Integer, nullable=False, default=50)
    allowed_sources = Column(ARRAY(String), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    insights = relationship("Insight", back_populates="entity", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="entity", cascade="all, delete-orphan")


class RawItem(Base):
    """Raw collected item before processing."""
    __tablename__ = "raw_items"

    id = Column(Integer, primary_key=True, index=True)
    source_url = Column(Text, nullable=False)
    source_type = Column(String(50), nullable=False)  # rss | web | reddit | youtube | regulatory
    title = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    published_at = Column(DateTime, nullable=True)
    collected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True, unique=True)
    is_processed = Column(Boolean, default=False, nullable=False)


class Insight(Base):
    """Processed, deduplicated, scored insight linked to an entity."""
    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    entity = relationship("Entity", back_populates="insights")

    title = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    event_type = Column(String(100), nullable=True)
    impact = Column(String(50), nullable=True)

    relevance_score = Column(Float, default=0.0)
    importance_score = Column(Float, default=0.0)
    recency_score = Column(Float, default=0.0)
    source_trust_score = Column(Float, default=0.0)
    final_score = Column(Float, default=0.0)

    source_urls = Column(ARRAY(Text), nullable=True)
    source_count = Column(Integer, default=1)

    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    raw_item_ids = Column(ARRAY(Integer), nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    entity = relationship("Entity", back_populates="alerts")
    insight_id = Column(Integer, ForeignKey("insights.id"), nullable=True)

    message = Column(Text, nullable=False)
    trigger_reason = Column(String(100), nullable=False)
    is_sent = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)
