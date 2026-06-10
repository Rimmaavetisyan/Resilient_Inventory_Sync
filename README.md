Resilient Inventory Sync & Dashboard

This project is split into two tasks. Task 1 is a backend Node.js service that periodically syncs product inventory from a warehouse API into a PostgreSQL database. Task 2 is a React dashboard that displays live data from three microservices: Shipments, Fleet, and Weather. Both tasks are designed around a core problem — the APIs they depend on are unreliable and return errors frequently. The solution to that problem is the same in both: exponential backoff with retry logic, structured logging, and correlation IDs to trace what happened across the system.

The Problem

Real-world APIs fail. A warehouse API returning a 503 Service Unavailable error is not a crash — it is a temporary condition that should be retried. A dashboard panel that goes blank because one microservice is slow is bad user experience. The engineering challenge is building systems that handle failure gracefully without the developer needing to write special-case code everywhere.

Task 1 — How It Works

The service starts and immediately runs a sync. Every 30 seconds after that, it runs again. Each sync cycle works like this:

First, it generates a UUID called a correlation ID. This ID will be attached to every log line and every outgoing HTTP request header for this sync, so you can search your logs for that one ID and see the full story of what happened.

Next, it calls the warehouse API using an HTTP client built on axios. The HTTP client wraps every request in retry logic. If the API returns a 503 or 429, it waits and tries again. The waiting time follows an exponential backoff formula: the first retry waits 200 milliseconds, the second waits 400, the third waits 800, and so on up to a maximum of 10 seconds. A small amount of randomness called jitter is added to each delay so that if multiple instances of the service are running at the same time, they do not all retry at the exact same moment and overwhelm the API again.

If the API returns a 4xx error like 400 or 404, the service does not retry. A bad request will not fix itself.

Once the data arrives, it is normalized. The warehouse API is inconsistent — sometimes it returns a bare array, sometimes it wraps it in an object, sometimes it uses the field name "stock" instead of "quantity". The normalization step handles all of these variations and filters out any rows with missing or invalid data.

The cleaned data is then written to PostgreSQL in a single bulk transaction. All rows are upserted in one SQL query — if a SKU already exists, its quantity is updated; if it is new, it is inserted. The entire operation runs inside a BEGIN/COMMIT block so that if anything fails, the database rolls back to its previous state and no partial data is saved.

Every step emits a structured JSON log line using the pino library. The log includes the correlation ID, the timestamp, the log level, and whatever fields are relevant to that step — attempt number, delay, row count, error message. This format can be shipped directly to any log aggregation system.

The scheduler that runs the sync has an overlap guard. If a sync takes longer than 30 seconds for any reason, the next scheduled tick is skipped rather than running a second sync in parallel.

Task 2 — How It Works

The dashboard renders three panels side by side — Shipments, Fleet, and Weather. Each panel manages its own data independently using a custom React hook called useApiWithRetry. If the Fleet panel fails, the Shipments and Weather panels are completely unaffected.

When a panel mounts, the hook immediately starts a fetch. It generates a new correlation ID for that request and attaches it to the HTTP header and to every log line for that fetch cycle. If the request fails with a 5xx or 429 error, the hook retries with exponential backoff — 300ms, 600ms, 1200ms — up to a maximum of 3 retries. If all retries are exhausted, the panel moves to an error state and shows a Retry button. Clicking Retry runs a fresh foreground fetch.

The panel has three distinct visual states. Loading shows the text "Loading…" or "Loading — retry 2…" so the user knows a retry is in progress. Error shows the error message and a Retry button. Success shows the data along with the last-updated timestamp and a Refresh button.

The Refresh button triggers a background fetch. Unlike a retry, a background fetch keeps the existing data on screen while silently polling for fresh data. If the background refresh fails, the old data stays visible and a soft warning is shown. The panel never goes blank just because a background refresh failed.

Each panel auto-refreshes every 15 seconds using the same background mode. The hook uses an AbortController so that if a component unmounts or a new fetch starts before the previous one finishes, the in-flight network request is cancelled immediately. This prevents stale responses from overwriting fresh data.

The hook's structured logger emits JSON to the browser console on every request started, retry, success, and failure. Each line includes the correlation ID, the URL, the attempt number, and the HTTP status. These IDs match the IDs that the mock backend logs on the server side, so you can trace a single request across both frontend and backend logs by searching for the same ID.

Technologies Used

Node.js is used for the backend sync service. Express is used for the mock backend that simulates the flaky microservices. axios is the HTTP client in Task 1. pino is the structured JSON logger in Task 1. pg is the PostgreSQL client. React 18 is used for the dashboard UI. Vite is the frontend build tool and dev server. Vitest is the test runner for both tasks. Testing Library is used to render and interact with React components in tests.

How the Problems Were Solved

The flaky API problem is solved by the retry-with-backoff pattern. The service never crashes on a 503 — it waits an increasing amount of time and tries again, up to a limit.

The thundering herd problem — where many clients all retry at the same moment and flood the API — is solved by jitter. Each retry delay is randomized so retries are spread out naturally.

The partial database write problem is solved by wrapping all inserts in a single transaction. Either all rows are saved or none are.

The dashboard panel isolation problem is solved by giving each panel its own independent hook instance. One failing service does not affect the others.

The blank screen during refresh problem is solved by the background fetch mode. Existing data stays visible until new data arrives successfully.

The traceability problem — not knowing which frontend request caused which backend log entry — is solved by correlation IDs. The same UUID travels from the browser through the HTTP header into the server log.

Running the Project

Start the mock backend first by running node server.js inside the mock-backend folder. It starts on port 4000. Then start the dashboard by running npm run dev inside task2-dashboard. It opens on port 5173 and proxies all API calls to the mock backend automatically. For Task 1, PostgreSQL must be running, the schema must be applied, and the .env file must be configured before running npm start inside task1-inventory-sync.

Tests and Coverage

Task 1 has 32 tests covering backoff logic, HTTP client retry behavior, database transactions, scheduler overlap prevention, warehouse API normalization, and the full sync cycle. Statement coverage is 98.76 percent.

Task 2 has 21 tests covering the hook state machine, the required scenario of two 500 errors followed by a 200 on the third attempt, correlation ID propagation, background refresh behavior, component loading and error states, and manual retry recovery. Statement coverage is 96.82 percent.

Both tasks exceed the required 80 percent coverage threshold.
