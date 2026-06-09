/**
 * Exponential backoff utility (custom, dependency-free).
 *
 * delay(attempt) = min(maxDelay, baseDelay * factor^attempt), optionally with
 * "full jitter" (a random value in [0, computed]) to avoid the thundering-herd
 * problem where many clients retry in lockstep.
 */

export function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} attempt  Zero-based retry attempt (0 = first retry).
 */
export function calculateDelay(
  attempt,
  { baseDelayMs = 200, maxDelayMs = 10000, factor = 2, jitter = true, random = Math.random } = {}
) {
  const exponential = baseDelayMs * Math.pow(factor, attempt);
  const capped = Math.min(maxDelayMs, exponential);
  if (!jitter) return capped;
  return Math.round(random() * capped);
}

/**
 * Run `fn` and retry it with exponential backoff when it throws a retryable error.
 *
 * @param {(attempt:number)=>Promise<any>} fn
 * @param {object} options
 * @param {number} [options.retries]        Max retries (total attempts = retries + 1).
 * @param {(err:Error)=>boolean} [options.shouldRetry]  Decide if an error is retryable.
 * @param {(err:Error, attempt:number, delay:number)=>void} [options.onRetry]
 * @param {(ms:number)=>Promise<void>} [options.sleep]  Injectable for fast tests.
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 5,
    baseDelayMs = 200,
    maxDelayMs = 10000,
    factor = 2,
    jitter = true,
    shouldRetry = () => true,
    onRetry = () => {},
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let attempt = 0;
  // Loop until we either return a value or run out of retries.
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      const noMoreRetries = attempt >= retries;
      if (noMoreRetries || !shouldRetry(err)) {
        throw err;
      }
      const delay = calculateDelay(attempt, { baseDelayMs, maxDelayMs, factor, jitter, random });
      onRetry(err, attempt + 1, delay);
      await sleep(delay);
      attempt += 1;
    }
  }
}
