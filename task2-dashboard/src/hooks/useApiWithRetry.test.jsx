import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiWithRetry } from './useApiWithRetry.js';
import { CORRELATION_HEADER } from '../lib/correlation.js';

/** Build a fake fetch Response. */
function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// A logger whose output we can inspect, with a working child().
function makeLogger() {
  const calls = { info: [], warn: [], error: [] };
  const make = () => ({
    info: (f, m) => calls.info.push([f, m]),
    warn: (f, m) => calls.warn.push([f, m]),
    error: (f, m) => calls.error.push([f, m]),
    child: () => make(),
  });
  return { logger: make(), calls };
}

// Tiny delays keep the tests fast while still exercising real backoff timing.
const fastOpts = { baseDelayMs: 1, maxDelayMs: 5, jitter: false };

describe('useApiWithRetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 500 twice then 200 on the third attempt (the required scenario)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200, { shipments: [{ id: 'S1' }] }));

    const { result } = renderHook(() =>
      useApiWithRetry('/api/shipments', { ...fastOpts, fetchImpl })
    );

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual({ shipments: [{ id: 'S1' }] });
    expect(result.current.attempt).toBe(2); // two retries before success
    expect(result.current.error).toBeNull();
  });

  it('sends a correlation-id header on every attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200, { ok: true }));

    const { result } = renderHook(() => useApiWithRetry('/api/fleet', { ...fastOpts, fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('success'));

    const headersA = fetchImpl.mock.calls[0][1].headers;
    const headersB = fetchImpl.mock.calls[1][1].headers;
    expect(headersA[CORRELATION_HEADER]).toBeTruthy();
    // same correlation id is reused across retries of the same logical request
    expect(headersB[CORRELATION_HEADER]).toBe(headersA[CORRELATION_HEADER]);
  });

  it('logs structured lines that carry the correlation id', async () => {
    const { logger, calls } = makeLogger();
    // Spy on child() to capture the context it was given.
    const childContexts = [];
    const baseChild = logger.child;
    logger.child = (ctx) => {
      childContexts.push(ctx);
      return baseChild(ctx);
    };

    const fetchImpl = vi.fn().mockResolvedValue(response(200, { ok: true }));
    const { result } = renderHook(() =>
      useApiWithRetry('/api/weather', { ...fastOpts, fetchImpl, logger })
    );
    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(childContexts[0]).toHaveProperty('correlationId');
    expect(childContexts[0]).toHaveProperty('url', '/api/weather');
  });

  it('gives up after maxRetries and exposes the error state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(503));

    const { result } = renderHook(() =>
      useApiWithRetry('/api/shipments', { ...fastOpts, maxRetries: 2, fetchImpl })
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(result.current.error.message).toMatch(/503/);
  });

  it('does not retry on a 404 (non-retryable client error)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(404));

    const { result } = renderHook(() =>
      useApiWithRetry('/api/shipments', { ...fastOpts, fetchImpl })
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on a network error (no response)', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(response(200, { ok: true }));

    const { result } = renderHook(() =>
      useApiWithRetry('/api/fleet', { ...fastOpts, fetchImpl })
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stamps lastUpdated on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { ok: true }));
    const { result } = renderHook(() =>
      useApiWithRetry('/api/x', { ...fastOpts, fetchImpl, now: () => 1_700_000_000_000 })
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.lastUpdated).toBe(1_700_000_000_000);
  });

  it('refresh() re-fetches in the background, keeping data and advancing lastUpdated', async () => {
    let clock = 0;
    const now = () => (clock += 1000);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200, { v: 'one' }))
      .mockResolvedValueOnce(response(200, { v: 'two' }));

    const { result } = renderHook(() =>
      useApiWithRetry('/api/x', { ...fastOpts, fetchImpl, now })
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    const first = result.current.lastUpdated;
    expect(result.current.data).toEqual({ v: 'one' });

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ v: 'two' });
    expect(result.current.lastUpdated).toBeGreaterThan(first);
    expect(result.current.status).toBe('success');
  });

  it('keeps the last-known data when a background refresh fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200, { v: 'fresh' })) // initial OK
      .mockResolvedValue(response(503)); // refresh fails

    const { result } = renderHook(() =>
      useApiWithRetry('/api/x', { ...fastOpts, fetchImpl, maxRetries: 0 })
    );

    await waitFor(() => expect(result.current.data).toEqual({ v: 'fresh' }));

    await act(async () => {
      await result.current.refresh();
    });

    // Panel stays usable: still success, still old data, soft error flagged.
    expect(result.current.status).toBe('success');
    expect(result.current.data).toEqual({ v: 'fresh' });
    expect(result.current.error).toBeTruthy();
  });

  it('schedules a background refresh on the configured interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { ok: true }));

    // Long interval so the real timer never fires during the test; unmount
    // clears it. We only assert that the wiring registers the timer.
    const { result, unmount } = renderHook(() =>
      useApiWithRetry('/api/x', { ...fastOpts, fetchImpl, refreshIntervalMs: 30000 })
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);

    unmount();
    setIntervalSpy.mockRestore();
  });

  it('manual retry() re-runs the request after a failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(500)) // attempt 1
      .mockResolvedValueOnce(response(500)) // retry 1 -> still failing, maxRetries:1 => error
      .mockResolvedValueOnce(response(200, { ok: true })); // manual retry succeeds

    const { result } = renderHook(() =>
      useApiWithRetry('/api/weather', { ...fastOpts, maxRetries: 1, fetchImpl })
    );

    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({ ok: true });
  });
});
