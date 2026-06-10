import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInventoryRepository } from '../src/db.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeFakePool() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  return { pool, client };
}

describe('createInventoryRepository.upsertInventory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('wraps the batch in BEGIN/COMMIT and upserts all rows in one query', async () => {
    const { pool, client } = makeFakePool();
    const repo = createInventoryRepository({ pool, logger });

    const count = await repo.upsertInventory(
      [
        { sku: 'A', quantity: 1 },
        { sku: 'B', quantity: 2 },
      ],
      'cid'
    );

    expect(count).toBe(2);
    const queries = client.query.mock.calls.map((c) => c[0]);
    expect(queries[0]).toBe('BEGIN');
    expect(queries.at(-1)).toBe('COMMIT');
    const inserts = client.query.mock.calls.filter((c) => /INSERT INTO inventory/.test(c[0]));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['A', 1, 'B', 2]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('skips the DB entirely for an empty batch', async () => {
    const { pool, client } = makeFakePool();
    const repo = createInventoryRepository({ pool, logger });

    const count = await repo.upsertInventory([], 'cid');

    expect(count).toBe(0);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('ROLLBACKs and rethrows when a row fails, always releasing the client', async () => {
    const { pool, client } = makeFakePool();
    client.query.mockImplementation((sql) => {
      if (/INSERT/.test(sql)) throw new Error('constraint violation');
      return Promise.resolve({ rows: [] });
    });
    const repo = createInventoryRepository({ pool, logger });

    await expect(repo.upsertInventory([{ sku: 'A', quantity: 1 }], 'cid')).rejects.toThrow(
      'constraint violation'
    );

    const queries = client.query.mock.calls.map((c) => c[0]);
    expect(queries).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
