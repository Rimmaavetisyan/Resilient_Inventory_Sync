import pino from 'pino';

/**
 * Structured (JSON) logger.
 *
 * Every log line is a single JSON object so it can be shipped straight into
 * Loki / ELK / Datadog and queried by `correlationId`. We attach the
 * correlation id per-request via `logger.child({ correlationId })` so it shows
 * up on every line emitted while handling that request.
 */
export function createLogger({ level = 'info', ...rest } = {}) {
  return pino({
    level,
    // Emit `level` as a human string ("info") instead of the numeric pino code.
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    base: { service: 'inventory-sync' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...rest,
  });
}
