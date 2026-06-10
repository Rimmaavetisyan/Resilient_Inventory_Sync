# Resilient Inventory Sync & Dashboard

This project is split into two tasks.

- **Task 1** — a backend Node.js service that periodically syncs product inventory from a warehouse API into a PostgreSQL database.
- **Task 2** — a React dashboard that displays live data from three microservices: Shipments, Fleet, and Weather.

Both tasks are built around the same core problem: the APIs they depend on are unreliable and return errors frequently. The solution is the same in both — exponential backoff with retry logic, structured logging, and correlation IDs to trace what happened across the system.

---

## The Problem

Real-world APIs fail. A warehouse API returning a `503 Service Unavailable` is not a crash — it is a temporary condition that should be retried. A dashboard panel that goes blank because one microservice is slow is bad user experience. The engineering challenge is building systems that handle failure gracefully without writing special-case code everywhere.

---

## How It Works

### Task 1 — Inventory Sync Service

The service starts and immediately runs a sync. Every 30 seconds after that, it runs again. Each sync cycle:

1. Generates a UUID **correlation ID** attached to every log line and outgoing HTTP request header for that sync.
2. Calls the warehouse API via an axios HTTP client wrapped in retry logic. `503` and `429` responses are retried with **exponential backoff** — 200 ms, 400 ms, 800 ms — up to a 10 s cap. **Jitter** is added so parallel instances don't retry in lockstep. `4xx` errors (bad request) are not retried.
3. **Normalises** the response — the warehouse API is inconsistent and sometimes returns a bare array, sometimes wraps it in an object, and sometimes uses `"stock"` instead of `"quantity"`. Invalid rows are filtered out.
4. Writes the cleaned data to PostgreSQL in a **single bulk transaction**. All rows are upserted — existing SKUs are updated, new ones are inserted. A rollback on failure guarantees no partial writes.
5. Emits structured JSON log lines via **pino** at every step, including attempt number, delay, row count, and error messages.

The scheduler has an **overlap guard** — if a sync takes longer than 30 seconds, the next tick is skipped instead of running a second sync in parallel.

### Task 2 — React Dashboard

The dashboard renders three independent panels: Shipments, Fleet, and Weather. Each panel uses a custom `useApiWithRetry` hook. If one panel fails, the others are unaffected.

Each panel:

- Generates a correlation ID per fetch and attaches it to the HTTP header and every log line.
- Retries on `5xx` / `429` with backoff — 300 ms, 600 ms, 1 200 ms — up to 3 retries.
- Has three visual states: **Loading** (`"Loading…"` / `"Loading — retry 2…"`), **Error** (message + Retry button), **Success** (data + last-updated timestamp + Refresh button).
- **Background refresh** — the Refresh button and the 15-second auto-refresh both keep existing data on screen while polling. If the background refresh fails, the old data stays visible with a soft warning. The panel never goes blank.
- Uses an `AbortController` to cancel in-flight requests when a component unmounts or a new fetch starts.
- Emits structured JSON to the browser console on every request, retry, success, and failure — with correlation IDs that match the mock backend's server-side logs.

---

## Technologies

| Layer | Technology |
|---|---|
| Backend sync service | Node.js, axios, pino, pg |
| Mock backend | Express |
| Frontend | React 18, Vite |
| Testing | Vitest, Testing Library |
| Database | PostgreSQL 16 |
| Containers | Docker, Docker Compose |

---

## Running the Project

### Option 1 — Docker Compose (recommended)

Starts everything — PostgreSQL, mock backend, sync service, and dashboard — in one command. No local Node.js or PostgreSQL install required.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| Mock backend API | http://localhost:4000 |
| PostgreSQL | localhost:5432 |

To stop and remove containers:

```bash
docker compose down
```

To also delete the database volume:

```bash
docker compose down -v
```

---

### Option 2 — Run locally (manual)

#### Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally

#### 1. Apply the database schema

```bash
psql -U postgres -d inventory -f task1-inventory-sync/schema.sql
```

#### 2. Configure Task 1 environment

```bash
cp task1-inventory-sync/.env.example task1-inventory-sync/.env
```

Edit `.env` if your database credentials differ from the defaults:

```env
WAREHOUSE_API_URL=http://localhost:4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/inventory
POLL_INTERVAL_MS=30000
LOG_LEVEL=info
```

#### 3. Start the mock backend

```bash
cd mock-backend
npm install
node server.js
# Listening on port 4000
```

#### 4. Start the inventory sync service (Task 1)

```bash
cd task1-inventory-sync
npm install
npm start
```

#### 5. Start the dashboard (Task 2)

```bash
cd task2-dashboard
npm install
npm run dev
# Open http://localhost:5173
```

The dashboard proxies all API calls to the mock backend automatically via the Vite dev server config.

---

## Tests and Coverage

Run tests for each task from its directory:

```bash
# Task 1
cd task1-inventory-sync && npm test

# Task 2
cd task2-dashboard && npm test
```

| Task | Tests | Statement coverage |
|---|---|---|
| Task 1 | 32 | 98.76% |
| Task 2 | 21 | 96.82% |

Both tasks exceed the required 80% threshold.

**Task 1 coverage includes:** backoff logic, HTTP client retry behaviour, database transactions, scheduler overlap prevention, warehouse API normalisation, full sync cycle.

**Task 2 coverage includes:** hook state machine, two 500 errors followed by a 200 on the third attempt, correlation ID propagation, background refresh behaviour, component loading and error states, manual retry recovery.

---

## How the Problems Were Solved

| Problem | Solution |
|---|---|
| Flaky API (503 / 429) | Retry with exponential backoff — never crashes, just waits and tries again |
| Thundering herd (all clients retry at once) | Jitter — each delay is randomised so retries are spread out |
| Partial database writes | Single transaction — either all rows are saved or none are |
| Dashboard panel isolation | Each panel has its own independent hook instance |
| Blank screen during refresh | Background fetch mode — existing data stays visible until new data arrives |
| Traceability across frontend and backend | Correlation IDs — the same UUID travels from the browser through the HTTP header into the server log |
