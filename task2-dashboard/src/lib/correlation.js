export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Generate a correlation id for a request. Prefers the native
 * crypto.randomUUID() (browsers + Node 19+), with a tiny fallback for
 * older/edge runtimes so the app never crashes on this.
 */
export function newCorrelationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'cid-xxxxxxxxyxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
