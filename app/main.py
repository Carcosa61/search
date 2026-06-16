from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import create_all_tables
from app.routers import entities, dashboard, alerts


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all_tables()
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


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/refresh")
def trigger_refresh():
    """Manually trigger a crawl cycle for all active entities."""
    from app.tasks.workers import enqueue_refresh
    enqueue_refresh()
    return {"status": "queued"}
