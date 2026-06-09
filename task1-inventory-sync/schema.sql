-- Run once against your local PostgreSQL before starting the service.
CREATE TABLE IF NOT EXISTS inventory (
  sku        TEXT PRIMARY KEY,
  quantity   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
