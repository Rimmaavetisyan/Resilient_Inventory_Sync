import { describe, it, expect, vi } from 'vitest';
import { calculateDelay, retryWithBackoff } from '../src/backoff.js';

describe('calculateDelay', () => {
  it('grows exponentially without jitter', () => {
    const opts = { baseDelayMs: 100, factor: 2, jitter: false };
    expect(calculateDelay(0, opts)).toBe(100);
    expect(calculateDelay(1, opts)).toBe(200); 
    expect(calculateDelay(2, opts)).toBe(400); 
    expect(calculateDelay(3, opts)).toBe(800);
  });

  it('caps at maxDelayMs', () => {
    const delay = calculateDelay(10, { baseDelayMs: 100, factor: 2, maxDelayMs: 1000, jitter: false });
    expect(delay).toBe(1000);
  });

  it('applies full jitter within [0, computed]', () => {
    const delay = calculateDelay(2, {
      baseDelayMs: 100,
      factor: 2,
      jitter: true,
      random: () => 0.5,
    });
    expect(delay).toBe(200); 
  });
});

describe('retryWithBackoff', () => {
  it('returns immediately on first success without sleeping', async () => {
    const sleep = vi.fn();
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(fn, { sleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries until success and reports each retry', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom1'))
      .mockRejectedValueOnce(new Error('boom2'))
      .mockResolvedValue('finally');

    const result = await retryWithBackoff(fn, {
      retries: 5,
      jitter: false,
      sleep,
      onRetry,
    });

    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(1);
    expect(onRetry.mock.calls[1][1]).toBe(2);
  });

  it('gives up after exhausting retries and throws the last error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retryWithBackoff(fn, { retries: 2, jitter: false, sleep })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const sleep = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));

    await expect(
      retryWithBackoff(fn, { retries: 5, sleep, shouldRetry: () => false })
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
