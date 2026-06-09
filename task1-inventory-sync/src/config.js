import 'dotenv/config';

/**
 * Centralised, environment-driven configuration.
 * Keeping this in one place makes it trivial to override in tests.
 */
export function loadConfig(env = process.env) {
  return {
    warehouse: {
      baseUrl: env.WAREHOUSE_API_URL || 'http://localhost:4000',
      timeoutMs: Number(env.WAREHOUSE_TIMEOUT_MS || 5000),
    },
    retry: {
      retries: Number(env.RETRY_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(env.RETRY_BASE_DELAY_MS || 200),
      maxDelayMs: Number(env.RETRY_MAX_DELAY_MS || 10000),
      factor: Number(env.RETRY_FACTOR || 2),
    },
    db: {
      connectionString:
        env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/inventory',
    },
    poll: {
      intervalMs: Number(env.POLL_INTERVAL_MS || 30000),
    },
    logLevel: env.LOG_LEVEL || 'info',
  };
}
