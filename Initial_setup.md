```md
# Intelligent Monitoring Web App — Home Server Deployment Specification

## 1. Overview

This document defines a system that runs on a home Ubuntu server (Apache2 + Docker) and continuously monitors public web sources to extract, process, and present structured insights about:

- Companies
- Musical bands and artists
- Individuals
- Topics of interest

The system is designed to outperform manual search engines by focusing on:

> continuous monitoring + filtering + summarisation rather than live search

---

## 2. Core Concept

Instead of manually searching:

> User defines entities → system continuously monitors sources → system structures and summarises changes

---

## 3. System Architecture (Home Server)

### High-Level Flow

```

Internet
↓
Apache2 (Reverse Proxy)
↓
Docker Stack
├── Frontend (Dashboard UI)
├── Backend API (FastAPI / Flask)
├── Crawler Workers
├── Database (PostgreSQL)
├── Queue (Redis)
└── AI Processing Layer (optional local or API-based)

````

Apache2 acts only as a routing layer:

- `/` → frontend
- `/api` → backend

---

## 4. User Inputs

### 4.1 Tracked Entities

Users define items to monitor:

```yaml
name: string
type: company | music | person | topic
keywords: list[string]
related_entities: optional list[string]
priority: low | medium | high
````

Examples:

* Auction Technology Group
* Funding Circle
* Nemophila
* SAKI (guitarist)
* UK SME lending

---

### 4.2 User Preferences

```yaml
update_frequency: hourly | daily | weekly
alert_threshold: 0–100
allowed_sources:
  - news
  - blogs
  - reddit
  - youtube
  - official websites
  - regulatory filings
```

---

## 5. Data Collection Layer

The system uses modular, **free-source-based collectors**.

### 5.1 RSS Collector

* News sites
* Music blogs
* Industry publications

### 5.2 Web Scraper (Scrapy / Playwright)

* Company websites
* Band websites
* Press pages
* Festival pages

### 5.3 Reddit Collector

* Public subreddit search
* Keyword tracking

### 5.4 YouTube Collector

* Channel monitoring
* Video title + description parsing
* Optional transcript extraction

### 5.5 Regulatory Data Collector

* SEC filings
* Companies House filings
* Exchange announcements (RNS / SGX / HKEX)

---

## 6. Processing Layer (Core Intelligence)

### 6.1 Deduplication Engine

Removes repeated stories across sources.

---

### 6.2 Entity Matching

Maps content to tracked entities using:

* keyword matching
* embeddings similarity

Example:

* “European tour announced for Nemophila”
  → matches:

  * Nemophila
  * SAKI

---

### 6.3 Relevance Scoring

Each item is scored:

```yaml
relevance_score: 0–100
importance_score: 0–100
recency_score: 0–100
source_trust_score: 0–100
final_score: weighted combination
```

---

### 6.4 AI Summarisation Layer

Transforms raw content into structured insight:

Example:

```
Entity: Nemophila
Event: European tour announced
Impact: Medium
Summary: First EU tour scheduled across 5 countries in Q3.
Sources: 4
```

---

## 7. Data Storage

* PostgreSQL → structured entities + insights
* Redis → job queue
* Optional vector DB → semantic search (Qdrant / Weaviate)
* Object storage → raw HTML snapshots

---

## 8. Backend API

### Core Endpoints

```http
POST /entity
GET /entity/{id}
DELETE /entity/{id}
GET /dashboard
GET /alerts
POST /refresh
```

---

## 9. Frontend Dashboard

### Main Interface

* Entity list (left panel)
* Timeline of updates (center)
* Insight cards (right panel)

---

### Entity Detail Page

* Recent updates feed
* Trend graph (mentions over time)
* Source breakdown
* AI-generated summary
* Alerts log

---

### Filters

* Date range
* Source type
* Importance threshold
* Sentiment (optional future feature)

---

## 10. Alert System

Triggers alerts when:

```yaml
conditions:
  - importance_score > threshold
  - sudden spike in mentions
  - regulatory filing detected
  - major news event detected
```

Delivery options:

* Email
* Telegram bot
* Web notifications

---

## 11. Scheduling System

Cron or queue-based execution:

```
Every 15 minutes:
  high priority entities

Every 6 hours:
  medium priority entities

Daily:
  full summarisation + cleanup
```

---

## 12. Key Design Principle

This is NOT a search engine.

It is:

> a continuous intelligence system that converts scattered public information into structured knowledge

---

## 13. Important Limitations

### 13.1 Access Restrictions

* Paywalled content is not reliably accessible
* Login-required platforms may block automation
* Some sources explicitly forbid scraping

---

### 13.2 Rate Limits / Blocking

* Aggressive crawling can lead to IP blocking
* Must implement throttling per domain

---

### 13.3 Resource Constraints

Home servers must avoid:

* uncontrolled crawling loops
* heavy AI processing bursts
* unbounded entity expansion

---

## 14. Security Requirements (Critical)

### 14.1 Docker Isolation

* Crawlers must not run as root
* Each service isolated in containers

### 14.2 SSRF Protection

* Do not allow arbitrary URL injection from users
* Only crawl approved or derived sources

### 14.3 Rate Limiting

* 1–2 requests/sec per domain max

### 14.4 Input Validation

* Entities are NOT direct URLs
* Only allow structured keywords

---

## 15. Apache2 Setup (Reverse Proxy)

Apache handles HTTPS and routing:

```
/ → frontend (localhost:3000)
/api → backend (localhost:8000)
```

Recommended:

* Let’s Encrypt SSL
* Cloudflare Tunnel (optional)
* Apache remains stateless

---

## 16. Suggested Tech Stack

### Backend

* Python (FastAPI or Flask)
* Scrapy / Playwright
* Celery or RQ (task queue)

### Data

* PostgreSQL
* Redis
* Optional: Qdrant / Weaviate

### Frontend

* Next.js
* Tailwind CSS

### AI Layer

* OpenAI API OR local LLM (Ollama)
* Sentence-transformers embeddings

---

## 17. Example Use Case

Tracked entities:

* Funding Circle
* Auction Technology Group
* Nemophila
* SAKI

System outputs:

* SME lending weakening signals detected
* European tour announcement detected
* Hiring increase in competitor company
* New interview published

All automatically:

* collected
* deduplicated
* ranked
* summarised

---

## 18. Final Outcome

A personal intelligence system that answers:

> “What changed today about the things I care about — and why does it matter?”

without manual searching.

---

## 19. Deployment Summary (Home Server Reality Check)

This system is suitable for a home Ubuntu server because:

* It is modular (Docker-based)
* It is low-cost (uses free sources)
* It can be rate-limited
* It does not require heavy infrastructure

However, it must be treated as:

> a scheduled monitoring system, not a real-time web crawler

---

## 20. Optional Next Steps

You can extend this system into:

* Minimal MVP Docker Compose setup
* Full deployment blueprint for Apache2 + Cloudflare Tunnel
* Step-by-step build guide (week-by-week)
* Lightweight prototype (single Python script version)

```
```
