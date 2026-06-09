import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttpClient, isRetryableError } from '../src/httpClient.js';
import { CORRELATION_HEADER } from '../src/correlation.js';

function httpError(status) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status };
  return err;
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('isRetryableError', () => {
  it('retries 5xx and 429', () => {
    expect(isRetryableError(httpError(503))).toBe(true);
    expect(isRetryableError(httpError(500))).toBe(true);
    expect(isRetryableError(httpError(429))).toBe(true);
  });

  it('does not retry 4xx (except 429)', () => {
    expect(isRetryableError(httpError(400))).toBe(false);
    expect(isRetryableError(httpError(404))).toBe(false);
  });

  it('retries network errors with no response', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });
});

describe('createHttpClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches the correlation id header to the outgoing request', async () => {
    const axiosInstance = { request: vi.fn().mockResolvedValue({ data: { ok: true } }) };
    const client = createHttpClient({ axiosInstance, logger: silentLogger });

    await client.request({ method: 'GET', url: '/inventory' }, { correlationId: 'abc-123' });

    expect(axiosInstance.request).toHaveBeenCalledTimes(1);
    const sentConfig = axiosInstance.request.mock.calls[0][0];
    expect(sentConfig.headers[CORRELATION_HEADER]).toBe('abc-123');
  });

  it('retries on repeated 503s then succeeds (the flaky-warehouse scenario)', async () => {
    const axiosInstance = {
      request: vi
        .fn()
        .mockRejectedValueOnce(httpError(503))
        .mockRejectedValueOnce(httpError(503))
        .mockResolvedValue({ data: { products: [] } }),
    };
    const client = createHttpClient({
      axiosInstance,
      logger: silentLogger,
      retryOptions: { retries: 5, jitter: false, sleep: vi.fn().mockResolvedValue(undefined) },
    });

    const res = await client.request({ method: 'GET', url: '/inventory' }, { correlationId: 'cid' });

    expect(res.data).toEqual({ products: [] });
    expect(axiosInstance.request).toHaveBeenCalledTimes(3);
    expect(silentLogger.warn).toHaveBeenCalledTimes(2);
    expect(silentLogger.warn.mock.calls[0][0]).toMatchObject({
      correlationId: 'cid',
      status: 503,
    });
  });

  it('gives up after exhausting retries on persistent 503', async () => {
    const axiosInstance = { request: vi.fn().mockRejectedValue(httpError(503)) };
    const client = createHttpClient({
      axiosInstance,
      logger: silentLogger,
      retryOptions: { retries: 2, jitter: false, sleep: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(
      client.request({ method: 'GET', url: '/inventory' }, { correlationId: 'cid' })
    ).rejects.toThrow(/503/);

    expect(axiosInstance.request).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 400 and surfaces the error', async () => {
    const axiosInstance = { request: vi.fn().mockRejectedValue(httpError(400)) };
    const client = createHttpClient({
      axiosInstance,
      logger: silentLogger,
      retryOptions: { retries: 5, sleep: vi.fn() },
    });

    await expect(
      client.request({ method: 'GET', url: '/inventory' }, { correlationId: 'cid' })
    ).rejects.toThrow(/400/);
    expect(axiosInstance.request).toHaveBeenCalledTimes(1);
  });
});
