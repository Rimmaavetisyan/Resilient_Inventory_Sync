import { newCorrelationId } from './correlation.js';
import { normalizeInventory } from './warehouseApi.js';

/**
 * Orchestrates one sync cycle: fetch -> normalise -> persist.
 *
 * A new correlation id is minted per run and threaded through the warehouse
 * call, the DB write, and every log line, so a single id traces the request
 * end-to-end (and matches the `x-correlation-id` header sent to the warehouse).
 *
 * Errors are caught and returned as a result object rather than thrown — the
 * scheduler should keep ticking even when one cycle fails.
 */
export function createInventoryService({
  warehouseApi,
  repository,
  logger,
  correlationIdFactory = newCorrelationId,
}) {
  async function sync() {
    const correlationId = correlationIdFactory();
    const log = logger.child({ correlationId });
    log.info('sync_started');

    try {
      const payload = await warehouseApi.fetchInventory(correlationId);
      const items = normalizeInventory(payload);

      if (items.length === 0) {
        log.warn({ count: 0 }, 'sync_completed_empty_payload');
        return { ok: true, count: 0, correlationId };
      }

      const count = await repository.upsertInventory(items, correlationId);
      log.info({ count }, 'sync_completed');
      return { ok: true, count, correlationId };
    } catch (err) {
      log.error({ error: err.message }, 'sync_failed');
      return { ok: false, error: err.message, correlationId };
    }
  }

  return { sync };
}
