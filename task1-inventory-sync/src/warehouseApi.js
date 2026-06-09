/**
 * Thin client over the (flaky) central warehouse API.
 * The retry/backoff lives in the injected httpClient, so this stays simple.
 */
export function createWarehouseApi({ httpClient, baseUrl, timeoutMs = 5000 }) {
  async function fetchInventory(correlationId) {
    const res = await httpClient.request(
      {
        method: 'GET',
        url: `${baseUrl}/inventory`,
        timeout: timeoutMs,
      },
      { correlationId }
    );
    return res.data;
  }

  return { fetchInventory };
}

/**
 * Normalise the warehouse payload into a flat list of { sku, quantity }.
 * The warehouse is inconsistent: sometimes a bare array, sometimes
 * `{ products: [...] }`, and stock is called `quantity` or `stock`.
 */
export function normalizeInventory(payload) {
  const list = Array.isArray(payload) ? payload : payload?.products ?? [];
  return list
    .map((item) => ({
      sku: item.sku ?? item.id,
      quantity: Number(item.quantity ?? item.stock ?? 0),
    }))
    .filter((item) => item.sku != null && Number.isFinite(item.quantity));
}
