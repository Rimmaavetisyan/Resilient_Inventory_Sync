import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('falls back to sensible defaults when env is empty', () => {
    const cfg = loadConfig({});
    expect(cfg.warehouse.baseUrl).toBe('http://localhost:4000');
    expect(cfg.retry.retries).toBe(5);
    expect(cfg.retry.factor).toBe(2);
    expect(cfg.poll.intervalMs).toBe(30000);
    expect(cfg.logLevel).toBe('info');
  });

  it('reads values from the provided env map', () => {
    const cfg = loadConfig({
      WAREHOUSE_API_URL: 'http://wh:9000',
      RETRY_MAX_ATTEMPTS: '3',
      RETRY_BASE_DELAY_MS: '50',
      DATABASE_URL: 'postgres://u:p@db/x',
      POLL_INTERVAL_MS: '1000',
      LOG_LEVEL: 'debug',
    });
    expect(cfg.warehouse.baseUrl).toBe('http://wh:9000');
    expect(cfg.retry.retries).toBe(3);
    expect(cfg.retry.baseDelayMs).toBe(50);
    expect(cfg.db.connectionString).toBe('postgres://u:p@db/x');
    expect(cfg.poll.intervalMs).toBe(1000);
    expect(cfg.logLevel).toBe('debug');
  });
});
