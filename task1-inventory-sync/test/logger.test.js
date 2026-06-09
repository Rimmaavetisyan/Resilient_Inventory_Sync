import { describe, it, expect } from 'vitest';
import { createLogger } from '../src/logger.js';
import { newCorrelationId, CORRELATION_HEADER } from '../src/correlation.js';

describe('createLogger', () => {
  it('produces a working pino logger with a child() method', () => {
    const logger = createLogger({ level: 'silent' });
    expect(typeof logger.info).toBe('function');
    const child = logger.child({ correlationId: 'x' });
    expect(typeof child.info).toBe('function');
    expect(() => child.info({ foo: 1 }, 'hello')).not.toThrow();
  });
});

describe('correlation', () => {
  it('generates unique UUID-shaped ids', () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('exposes the standard correlation header name', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id');
  });
});
