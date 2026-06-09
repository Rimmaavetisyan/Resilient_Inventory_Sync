import { describe, it, expect, vi } from 'vitest';
import { calculateDelay } from './backoff.js';
import { newCorrelationId, CORRELATION_HEADER } from './correlation.js';
import { createLogger } from './logger.js';

describe('calculateDelay', () => {
  it('is exponential without jitter and capped at maxDelay', () => {
    const o = { baseDelayMs: 100, factor: 2, jitter: false };
    expect(calculateDelay(0, o)).toBe(100);
    expect(calculateDelay(1, o)).toBe(200);
    expect(calculateDelay(2, o)).toBe(400);
    expect(calculateDelay(10, { ...o, maxDelayMs: 1000 })).toBe(1000);
  });

  it('applies full jitter in [0, computed]', () => {
    expect(calculateDelay(2, { baseDelayMs: 100, factor: 2, jitter: true, random: () => 0.25 })).toBe(
      100
    ); // 0.25 * 400
  });
});

describe('correlation', () => {
  it('makes unique ids and exposes the header name', () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
    expect(CORRELATION_HEADER).toBe('x-correlation-id');
  });
});

describe('createLogger', () => {
  it('emits structured JSON to the sink with merged context', () => {
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = createLogger({ context: { app: 'test' }, sink }).child({ correlationId: 'cid-1' });

    log.info({ foo: 1 }, 'hello');

    expect(sink.info).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sink.info.mock.calls[0][0]);
    expect(payload).toMatchObject({
      level: 'info',
      app: 'test',
      correlationId: 'cid-1',
      foo: 1,
      message: 'hello',
    });
  });

  it('routes warn and error to the right sink methods', () => {
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = createLogger({ sink });
    log.warn({}, 'w');
    log.error({}, 'e');
    expect(sink.warn).toHaveBeenCalledTimes(1);
    expect(sink.error).toHaveBeenCalledTimes(1);
  });
});
