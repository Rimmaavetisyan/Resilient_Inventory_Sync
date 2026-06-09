import { describe, it, expect, vi } from 'vitest';
import { createInventoryService } from '../src/inventoryService.js';

function makeLogger() {
  const child = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

describe('createInventoryService.sync', () => {
  it('fetches, normalises and persists, returning a success result', async () => {
    const warehouseApi = {
      fetchInventory: vi.fn().mockResolvedValue({ products: [{ sku: 'A', stock: 7 }] }),
    };
    const repository = { upsertInventory: vi.fn().mockResolvedValue(1) };
    const logger = makeLogger();

    const service = createInventoryService({
      warehouseApi,
      repository,
      logger,
      correlationIdFactory: () => 'fixed-cid',
    });

    const result = await service.sync();

    expect(result).toEqual({ ok: true, count: 1, correlationId: 'fixed-cid' });
    expect(warehouseApi.fetchInventory).toHaveBeenCalledWith('fixed-cid');
    expect(repository.upsertInventory).toHaveBeenCalledWith([{ sku: 'A', quantity: 7 }], 'fixed-cid');
    expect(logger.child).toHaveBeenCalledWith({ correlationId: 'fixed-cid' });
  });

  it('returns an error result (does not throw) when the warehouse call fails', async () => {
    const warehouseApi = { fetchInventory: vi.fn().mockRejectedValue(new Error('503 forever')) };
    const repository = { upsertInventory: vi.fn() };
    const logger = makeLogger();

    const service = createInventoryService({
      warehouseApi,
      repository,
      logger,
      correlationIdFactory: () => 'cid-err',
    });

    const result = await service.sync();

    expect(result).toEqual({ ok: false, error: '503 forever', correlationId: 'cid-err' });
    expect(repository.upsertInventory).not.toHaveBeenCalled();
    expect(logger._child.error).toHaveBeenCalledWith({ error: '503 forever' }, 'sync_failed');
  });
});
