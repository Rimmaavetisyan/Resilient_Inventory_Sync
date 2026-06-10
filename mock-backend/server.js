import express from 'express';

/**
 * Mock "microservices" for the Resilient Dashboard demo.
 *
 * Serves Shipments, Fleet and Weather. Deliberately flaky: a configurable share
 * of requests return 503 (with a short Retry-After) so you can watch the
 * frontend's exponential-backoff retry logic recover in real time.
 *
 * It reads the inbound `x-correlation-id`, logs it as structured JSON, and
 * echoes it back — so a single id traces a request from the browser console
 * straight into these server logs.
 */

const PORT = Number(process.env.PORT || 4000);
// Probability that any given request fails with 503. 0.35 = ~1 in 3.
const FAILURE_RATE = Number(process.env.FAILURE_RATE ?? 0.35);
const CORRELATION_HEADER = 'x-correlation-id';

const app = express();

/** Structured JSON logger — same shape as the frontend logger. */
function log(level, fields) {
  process.stdout.write(
    JSON.stringify({ level, time: new Date().toISOString(), service: 'mock-backend', ...fields }) +
      '\n'
  );
}

// Capture/propagate the correlation id and log every request.
app.use((req, res, next) => {
  const correlationId = req.header(CORRELATION_HEADER) || 'none';
  res.set(CORRELATION_HEADER, correlationId);
  req.correlationId = correlationId;
  log('info', { msg: 'request_received', method: req.method, path: req.path, correlationId });
  next();
});

/**
 * Wrap a handler so it: (1) adds a little latency, (2) fails with 503 at
 * FAILURE_RATE, (3) otherwise returns fresh data.
 */
function flaky(buildPayload) {
  return (req, res) => {
    const latency = 120 + Math.floor(Math.random() * 280);
    setTimeout(() => {
      if (Math.random() < FAILURE_RATE) {
        log('warn', {
          msg: 'injected_failure',
          path: req.path,
          status: 503,
          correlationId: req.correlationId,
        });
        res.set('Retry-After', '1').status(503).json({ error: 'Service Unavailable' });
        return;
      }
      log('info', { msg: 'request_ok', path: req.path, correlationId: req.correlationId });
      res.json(buildPayload());
    }, latency);
  };
}

// --- Shipments ------------------------------------------------------------
const DESTINATIONS = ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt'];
const SHIP_STATUS = ['in transit', 'loading', 'delivered', 'delayed'];
app.get('/api/shipments', flaky(() => ({
  shipments: Array.from({ length: 5 }, (_, i) => ({
    id: `SHP-${1000 + i}`,
    destination: DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)],
    status: SHIP_STATUS[Math.floor(Math.random() * SHIP_STATUS.length)],
  })),
})));

// --- Fleet ----------------------------------------------------------------
const FLEET_STATUS = ['active', 'idle', 'maintenance', 'charging'];
const HUBS = ['Hub A', 'Hub B', 'Depot North', 'Depot South'];
app.get('/api/fleet', flaky(() => ({
  vehicles: Array.from({ length: 6 }, (_, i) => ({
    id: `VAN-${10 + i}`,
    status: FLEET_STATUS[Math.floor(Math.random() * FLEET_STATUS.length)],
    location: HUBS[Math.floor(Math.random() * HUBS.length)],
  })),
})));

// --- Weather --------------------------------------------------------------
const CONDITIONS = ['Clear', 'Cloudy', 'Rain', 'Snow', 'Windy'];
app.get('/api/weather', flaky(() => ({
  tempC: Math.round((Math.random() * 30 - 2) * 10) / 10,
  condition: CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)],
  location: 'Berlin HQ',
})));

// --- Inventory (consumed by Task 1 sync service) --------------------------
const SKUS = ['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004', 'SKU-005'];
app.get('/inventory', flaky(() => ({
  products: SKUS.map((sku) => ({
    sku,
    stock: Math.floor(Math.random() * 500),
  })),
})));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  log('info', { msg: 'mock_backend_started', port: PORT, failureRate: FAILURE_RATE });
});
