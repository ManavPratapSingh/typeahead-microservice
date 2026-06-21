# High-Throughput Search Typeahead Microservice

A real-time search auto-complete typeahead system built with **Node.js, TypeScript, Express, PostgreSQL** (durable, write-heavy database), and **Redis** (in-memory, read-heavy database).

This microservice handles a high frequency of search query logs on the write path while maintaining sub-15ms P99 search autocomplete suggestions on the read path.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Client [Client UI]
        UI[Search Autocomplete Bar]
    end

    subgraph ReadPath [Read Path - O(1) Cache]
        Redis[(Redis Cache)]
    end

    subgraph WritePath [Write Path - Buffering & Ingestion]
        Sampler[Hybrid In-Memory Sampler]
        Postgres[(PostgreSQL Store)]
    end

    subgraph Background [Background Processing Pipeline]
        Worker[Decay & Sync Worker]
    end

    UI -- 1. GET /suggest?q=prefix --> Redis
    UI -- 2. POST /search {query} --> Sampler
    Sampler -- 3. Bulk UPSERT (threshold G & X) --> Postgres
    Worker -- 4. Read queries & decrement linear decay --> Postgres
    Worker -- 5. Generate prefixes & compute top-5 --> Worker
    Worker -- 6. Pipeline atomic swap --> Redis
```

---

## Core System Design

### 1. The Read Path (`GET /suggest?q=<prefix>`)
* Autocomplete queries perform a direct, strict **$O(1)$ key lookup** in Redis via `prefix:<query>`.
* If a prefix key is missing, it returns an empty array `[]` instantly without hitting the primary SQL database.
* This prevents costly `LIKE` query execution or runtime database index scans, ensuring low latencies.

### 2. The Write Path with Hybrid Sampling (`POST /search`)
To protect PostgreSQL from connection pool exhaustion and database locks, incoming search queries undergo a two-tier hybrid sampling check:
* **Per-Query Threshold ($X = 5$):** We track query hit counts in-memory. Only when a query receives at least $X$ hits is its frequency promoted to the flush buffer. This filters out one-off or noisy search queries.
* **Global Batch Threshold ($G = 20$):** We track total promoted query hits. We only initiate a single bulk transaction (an atomic `ON CONFLICT DO UPDATE` UPSERT) to PostgreSQL once $G$ promoted hits are accumulated.

### 3. Linear Time-Decay & Sync Pipeline
The background sync worker runs on a configurable interval ($t = 120$ seconds) to synchronize the databases and apply decay:
* **Linear Decay:** Decrements search frequencies by a flat rate ($d = 2$) every cycle, floored at `0`. When a query reaches a frequency of `0` or less, it is pruned from PostgreSQL.
* **Prefix Generation:** Breaks down active search queries into sub-prefixes (e.g., `"apple"` → `["a", "ap", "app", "appl", "apple"]`).
* **Ranking & Redis Swap:** Ranks terms per prefix by frequency descending, selects the top 5, and swaps them atomically in Redis using pipelined writes.

---

## Performance & Latency Specifications

* **P99 Read Latency:** `< 5ms` (Redis key-value lookups from RAM)
* **Write Throughput Support:** Scaling to thousands of requests per second through hybrid memory buffering.

---

## Setup & Running

### Prerequisites
* Docker & Docker Compose
* Node.js (v18+)

### 1. Install Dependencies & Setup Environment
Install the Node.js packages and configure your local environment settings:
```bash
npm install
# Copy the example environment template
cp .env.example .env  # Linux/macOS
copy .env.example .env # Windows
```

### 2. Spin up Databases
Runs PostgreSQL on port `5433` (to avoid conflict with local postgres on 5432) and Redis on port `6379`:
```bash
docker-compose up -d
```

### 3. Initialize Database Schema
Creates the `search_frequencies` table and performance index:
```bash
npm run db:init
```

### 4. Seed Amazon Product Dataset
Generates and bulk inserts 500 unique Amazon-style products with randomized review counts:
```bash
npm run seed
```

### 5. Run Development Server
```bash
npm run dev
```
Access the autocomplete UI at **http://localhost:3000**.
