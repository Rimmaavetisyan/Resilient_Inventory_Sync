import { randomUUID } from 'node:crypto';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Generate a fresh correlation id for a unit of work (one sync run, one request). */
export function newCorrelationId() {
  return randomUUID();
}
