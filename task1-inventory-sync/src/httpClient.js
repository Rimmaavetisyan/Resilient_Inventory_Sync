import axios from 'axios';
import { retryWithBackoff } from './backoff.js';
import { CORRELATION_HEADER } from './correlation.js';

/**
 * Is this error worth retrying? We retry on:
 *  - 5xx responses (503 Service Unavailable is the warehouse's favourite)
 *  - 429 Too Many Requests
 *  - network-level errors with no response (ECONNRESET, timeout, DNS, etc.)
 * We do NOT retry on 4xx (bad request / auth) — those won't fix themselves.
 */
export function isRetryableError(err) {
  const status = err?.response?.status;
  if (status === undefined) return true; // no response => network/timeout error
  return status >= 500 || status === 429;
}

/**
 * HTTP client that:
 *  - injects the correlation id header on every request,
 *  - retries flaky calls with exponential backoff,
 *  - logs every attempt/retry as structured JSON.
 *
 * The underlying axios instance is injectable so tests can mock it.
 */
export function createHttpClient({
  axiosInstance = axios.create(),
  logger,
  retryOptions = {},
} = {}) {
  async function request(config, { correlationId } = {}) {
    const headers = {
      ...config.headers,
      [CORRELATION_HEADER]: correlationId,
    };

    return retryWithBackoff(
      async (attempt) => {
        logger?.info(
          { correlationId, attempt: attempt + 1, method: config.method, url: config.url },
          'http_request_attempt'
        );
        return axiosInstance.request({ ...config, headers });
      },
      {
        ...retryOptions,
        shouldRetry: isRetryableError,
        onRetry: (err, attempt, delay) => {
          logger?.warn(
            {
              correlationId,
              attempt,
              delayMs: delay,
              status: err?.response?.status ?? null,
              error: err.message,
            },
            'http_request_retry'
          );
        },
      }
    );
  }

  return { request };
}
