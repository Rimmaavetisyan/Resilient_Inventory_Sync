/**
 * Exponential backoff with optional full jitter (browser-friendly, no deps).
 * delay(attempt) = min(maxDelay, baseDelay * factor^attempt)
 */
export function calculateDelay(
  attempt,
  { baseDelayMs = 300, maxDelayMs = 8000, factor = 2, jitter = true, random = Math.random } = {}
) {
  const exponential = baseDelayMs * Math.pow(factor, attempt);
  const capped = Math.min(maxDelayMs, exponential);
  if (!jitter) return capped;
  return Math.round(random() * capped);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
