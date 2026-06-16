"""Scheduler — enqueues collection jobs on a cron-like schedule using APScheduler."""
from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from app.tasks.workers import enqueue_refresh

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BlockingScheduler()


def enqueue_high_priority():
    """Every 15 minutes — high-priority entities."""
    logger.info("Scheduling high-priority crawl")
    enqueue_refresh()


def enqueue_medium_priority():
    """Every 6 hours — medium-priority entities."""
    logger.info("Scheduling medium-priority crawl")
    enqueue_refresh()


def enqueue_full_cycle():
    """Daily — full summarisation + cleanup."""
    logger.info("Scheduling full daily cycle")
    enqueue_refresh()


scheduler.add_job(enqueue_high_priority, CronTrigger(minute="*/15"))
scheduler.add_job(enqueue_medium_priority, CronTrigger(hour="*/6"))
scheduler.add_job(enqueue_full_cycle, CronTrigger(hour=2, minute=0))  # 02:00 daily

if __name__ == "__main__":
    logger.info("Scheduler starting")
    scheduler.start()
