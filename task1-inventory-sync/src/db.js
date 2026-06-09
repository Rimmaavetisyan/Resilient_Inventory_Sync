import pg from 'pg';

/** Create a pg connection pool. Kept separate so it can be swapped/mocked. */
export function createPool(connectionString) {
  return new pg.Pool({ connectionString });
}

/**
 * Repository for inventory rows. Performs a transactional bulk UPSERT so a
 * single bad row rolls the whole batch back rather than leaving the DB
 * half-updated.
 *
 * The `pool` is injected -> in tests we pass a fake pool whose client records
 * the queries it received.
 */
export function createInventoryRepository({ pool, logger }) {
  async function upsertInventory(items, correlationId) {
    if (!items.length) {
      logger?.info({ correlationId, count: 0 }, 'inventory_upsert_skipped_empty');
      return 0;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          `INSERT INTO inventory (sku, quantity, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (sku)
           DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
          [item.sku, item.quantity]
        );
      }
      await client.query('COMMIT');
      logger?.info({ correlationId, count: items.length }, 'inventory_upserted');
      return items.length;
    } catch (err) {
      await client.query('ROLLBACK');
      logger?.error({ correlationId, error: err.message }, 'inventory_upsert_failed');
      throw err;
    } finally {
      client.release();
    }
  }

  return { upsertInventory };
}
