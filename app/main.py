from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import create_all_tables
from app.routers import entities, dashboard, alerts
from app.routers import sources as sources_router


_DEFAULT_SOURCES = [
    # RSS
    {"label": "Reuters Business", "type": "rss", "url": "https://feeds.reuters.com/reuters/businessNews", "is_global": True},
    {"label": "TechCrunch", "type": "rss", "url": "https://feeds.feedburner.com/TechCrunch/", "is_global": True},
    {"label": "The Guardian Business", "type": "rss", "url": "https://www.theguardian.com/business/rss", "is_global": True},
    {"label": "NYT Business", "type": "rss", "url": "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", "is_global": True},
    {"label": "BBC Business", "type": "rss", "url": "https://feeds.bbci.co.uk/news/business/rss.xml", "is_global": True},
    {"label": "Pitchfork", "type": "rss", "url": "https://pitchfork.com/rss/news/", "is_global": True},
    {"label": "NME", "type": "rss", "url": "https://www.nme.com/feed", "is_global": True},
    {"label": "SEC EDGAR Atom", "type": "rss", "url": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=40&output=atom", "is_global": True},
    # Reddit
    {"label": "r/worldnews", "type": "reddit", "config": {"subreddit": "worldnews"}, "is_global": True},
    {"label": "r/news", "type": "reddit", "config": {"subreddit": "news"}, "is_global": True},
    {"label": "r/investing", "type": "reddit", "config": {"subreddit": "investing"}, "is_global": True},
    {"label": "r/stocks", "type": "reddit", "config": {"subreddit": "stocks"}, "is_global": True},
    {"label": "r/ukpersonalfinance", "type": "reddit", "config": {"subreddit": "ukpersonalfinance"}, "is_global": True},
    {"label": "r/wallstreetbets", "type": "reddit", "config": {"subreddit": "wallstreetbets"}, "is_global": True},
    {"label": "r/music", "type": "reddit", "config": {"subreddit": "music"}, "is_global": True},
    {"label": "r/technology", "type": "reddit", "config": {"subreddit": "technology"}, "is_global": True},
    {"label": "r/science", "type": "reddit", "config": {"subreddit": "science"}, "is_global": True},
    {"label": "r/economics", "type": "reddit", "config": {"subreddit": "economics"}, "is_global": True},
    # Regulatory
    {"label": "SEC EDGAR (8-K filings)", "type": "regulatory", "config": {"service": "sec"}, "is_global": True},
    {"label": "Companies House (UK)", "type": "regulatory", "config": {"service": "companies_house"}, "is_global": True},
]


def _seed_default_sources() -> None:
    from app.database import SessionLocal
    from app.models import Source
    db = SessionLocal()
    try:
        if db.query(Source).count() == 0:
            for s in _DEFAULT_SOURCES:
                db.add(Source(
                    label=s["label"],
                    type=s["type"],
                    url=s.get("url"),
                    config=s.get("config"),
                    is_global=s.get("is_global", True),
                ))
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all_tables()
    _seed_default_sources()
    yield


app = FastAPI(
    title="Intelligent Monitoring API",
    description="Continuous intelligence system for tracking entities across public web sources.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entities.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(sources_router.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/refresh")
def trigger_refresh():
    """Manually trigger a crawl cycle for all active entities."""
    from app.tasks.workers import enqueue_refresh
    enqueue_refresh()
    return {"status": "queued"}
