import { describe, it, expect, vi } from 'vitest';
import { createWarehouseApi, normalizeInventory } from '../src/warehouseApi.js';

describe('normalizeInventory', () => {
  it('handles a bare array with `quantity`', () => {
    expect(normalizeInventory([{ sku: 'A', quantity: 5 }])).toEqual([{ sku: 'A', quantity: 5 }]);
  });

  it('handles a { products } envelope and `stock` alias', () => {
    const out = normalizeInventory({ products: [{ id: 'B', stock: '12' }] });
    expect(out).toEqual([{ sku: 'B', quantity: 12 }]);
  });

  it('drops rows without a sku or with a non-numeric quantity', () => {
    const out = normalizeInventory([
      { sku: 'A', quantity: 1 },
      { quantity: 9 },
      { sku: 'C', quantity: 'oops' }, 
    ]);
    expect(out).toEqual([{ sku: 'A', quantity: 1 }]);
  });

  it('returns [] for null / unexpected payloads', () => {
    expect(normalizeInventory(null)).toEqual([]);
    expect(normalizeInventory({})).toEqual([]);
  });
});

describe('createWarehouseApi', () => {
  it('fetches /inventory and passes the correlation id through', async () => {
    const httpClient = {
      request: vi.fn().mockResolvedValue({ data: [{ sku: 'A', quantity: 3 }] }),
    };
    const api = createWarehouseApi({ httpClient, baseUrl: 'http://wh', timeoutMs: 1234 });

    const data = await api.fetchInventory('corr-1');

    expect(data).toEqual([{ sku: 'A', quantity: 3 }]);
    const [config, ctx] = httpClient.request.mock.calls[0];
    expect(config).toMatchObject({ method: 'GET', url: 'http://wh/inventory', timeout: 1234 });
    expect(ctx).toEqual({ correlationId: 'corr-1' });
  });
});
