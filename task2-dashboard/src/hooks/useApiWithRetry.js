import { useState, useEffect, useCallback, useRef } from 'react';
import { calculateDelay, sleep } from '../lib/backoff.js';
import { newCorrelationId, CORRELATION_HEADER } from '../lib/correlation.js';
import { logger as defaultLogger } from '../lib/logger.js';

/**
 * Decide whether a failed request is worth retrying.
 * Retry on 5xx, 429, and transport-level failures (status === undefined).
 * Never retry 4xx — a bad request won't fix itself.
 */
function isRetryable(err) {
  if (err.status === undefined) return true;
  return err.status >= 500 || err.status === 429;
}

// Module-level so the default has a STABLE identity across renders. (An inline
// `() => Date.now()` default would be a new function every render, churning the
// `execute` useCallback and re-firing the load effect in an infinite loop.)
const defaultNow = () => Date.now();

/**
 * useApiWithRetry — fetches a URL with exponential backoff + jitter.
 *
 * State machine (each panel renders distinct UI per status):
 *   status: 'idle' | 'loading' | 'success' | 'error'
 *   data, error, attempt, lastUpdated, isRefreshing
 *
 * Two ways to (re)fetch:
 *   - retry()   — FOREGROUND: clears data, shows the loading state. Used to
 *                 recover from a hard error.
 *   - refresh() — BACKGROUND: keeps the current data on screen, flips
 *                 `isRefreshing`, and only swaps in new data once it arrives.
 *                 If a background refresh ultimately fails, the last-known data
 *                 stays put (resilient) and `error` is set as a soft warning.
 *
 * Auto-refresh: pass `refreshIntervalMs` to poll in the background on a timer.
 *
 * Threads a fresh `x-correlation-id` header through every attempt and stamps it
 * on each structured log line, so frontend logs map 1:1 to backend logs.
 *
 * `fetchImpl`, `logger` and `now` are injectable purely to keep this testable.
 */
export function useApiWithRetry(url, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 300,
    maxDelayMs = 8000,
    factor = 2,
    jitter = true,
    enabled = true,
    refreshIntervalMs = 0,
    fetchImpl,
    logger = defaultLogger,
    now = defaultNow,
  } = options;

  const [state, setState] = useState({
    status: 'idle',
    data: null,
    error: null,
    attempt: 0,
    lastUpdated: null,
    isRefreshing: false,
  });

  // Guard against setting state after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = useCallback((next) => {
    if (mountedRef.current) setState(next);
  }, []);

  // Latest state, readable inside `execute` without making it a dependency
  // (so the auto-refresh interval isn't torn down on every data change).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Hold the function-valued options in refs so `execute`'s identity does NOT
  // depend on them. Callers often pass these inline (`now={() => Date.now()}`,
  // a fresh `fetchImpl`, etc.); without this, a new identity every render would
  // churn `execute` and re-fire the load effect in an infinite loop.
  const fetchRef = useRef(fetchImpl);
  const loggerRef = useRef(logger);
  const nowRef = useRef(now);
  useEffect(() => {
    fetchRef.current = fetchImpl;
    loggerRef.current = logger;
    nowRef.current = now;
  });

  const execute = useCallback(
    async ({ background = false } = {}) => {
      const doFetch = fetchRef.current || globalThis.fetch;
      const correlationId = newCorrelationId();
      const log = loggerRef.current.child({ correlationId, url });
      // A "background" refresh only makes sense if we already have data to show.
      const isBackground = background && stateRef.current.data != null;

      if (isBackground) {
        safeSet((s) => ({ ...s, isRefreshing: true }));
      } else {
        safeSet((s) => ({
          ...s,
          status: 'loading',
          data: null,
          error: null,
          attempt: 0,
          isRefreshing: false,
        }));
      }
      log.info({ background: isBackground }, 'request_started');

      let attempt = 0;
      for (;;) {
        try {
          const res = await doFetch(url, {
            headers: {
              [CORRELATION_HEADER]: correlationId,
              Accept: 'application/json',
            },
          });

          if (!res.ok) {
            const err = new Error(`Request failed with status ${res.status}`);
            err.status = res.status;
            throw err;
          }

          let data;
          try {
            data = await res.json();
          } catch (parseErr) {
            const err = new Error(`JSON parse error: ${parseErr.message}`);
            err.status = 422;
            throw err;
          }
          safeSet({
            status: 'success',
            data,
            error: null,
            attempt,
            lastUpdated: nowRef.current(),
            isRefreshing: false,
          });
          log.info({ attempt: attempt + 1, background: isBackground }, 'request_succeeded');
          return data;
        } catch (err) {
          const canRetry = isRetryable(err) && attempt < maxRetries;
          if (!canRetry) {
            if (isBackground) {
              // Keep the last good data on screen; flag the failed refresh softly.
              safeSet((s) => ({ ...s, isRefreshing: false, error: err, attempt }));
              log.warn(
                { attempt: attempt + 1, status: err.status ?? null, error: err.message },
                'background_refresh_failed'
              );
              return stateRef.current.data;
            }
            safeSet((s) => ({
              ...s,
              status: 'error',
              data: null,
              error: err,
              attempt,
              isRefreshing: false,
            }));
            log.error(
              { attempt: attempt + 1, status: err.status ?? null, error: err.message },
              'request_failed'
            );
            throw err;
          }

          const delay = calculateDelay(attempt, { baseDelayMs, maxDelayMs, factor, jitter });
          attempt += 1;
          // Foreground retries surface as "loading (retry N)"; background
          // retries stay quiet — the old data is still visible.
          if (!isBackground) {
            safeSet((s) => ({ ...s, status: 'loading', data: null, attempt }));
          }
          log.warn(
            {
              attempt,
              delayMs: delay,
              status: err.status ?? null,
              error: err.message,
              background: isBackground,
            },
            'request_retry'
          );
          await sleep(delay);
        }
      }
    },
    [url, maxRetries, baseDelayMs, maxDelayMs, factor, jitter, safeSet]
  );

  // Initial load on mount / when the request identity changes.
  useEffect(() => {
    if (!enabled) return;
    execute().catch(() => {
      /* terminal failure already reflected in state */
    });
  }, [execute, enabled]);

  // Auto-refresh on a timer (background, so the UI never flickers).
  useEffect(() => {
    if (!enabled || !refreshIntervalMs) return undefined;
    const id = setInterval(() => {
      execute({ background: true }).catch(() => {});
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [execute, enabled, refreshIntervalMs]);

  // retry: foreground (recover from error). refresh: background (live update).
  const retry = useCallback(() => execute({ background: false }).catch(() => {}), [execute]);
  const refresh = useCallback(() => execute({ background: true }).catch(() => {}), [execute]);

  return { ...state, retry, refresh };
}
