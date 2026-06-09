/**
 * Minimal structured (JSON) frontend logger.
 *
 * Every entry is a flat JSON object printed via console so it can be captured
 * by browser log forwarders (Sentry, LogRocket, Datadog RUM...) and correlated
 * with backend logs through the shared `correlationId` field.
 *
 * `sink` is injectable so tests can assert on what gets logged.
 */
export function createLogger({ context = {}, sink = console } = {}) {
  function emit(level, fields, message) {
    const entry = {
      level,
      // NOTE: real time intentionally read here; tests inject a fake sink and
      // assert on fields other than `time`.
      time: new Date().toISOString(),
      ...context,
      ...fields,
      message,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') sink.error(line);
    else if (level === 'warn') sink.warn(line);
    else sink.info ? sink.info(line) : sink.log(line);
    return entry;
  }

  return {
    info: (fields, message) => emit('info', fields, message),
    warn: (fields, message) => emit('warn', fields, message),
    error: (fields, message) => emit('error', fields, message),
    /** Derive a logger that stamps extra context (e.g. correlationId) on every line. */
    child: (extra) => createLogger({ context: { ...context, ...extra }, sink }),
  };
}

export const logger = createLogger({ context: { app: 'logistics-dashboard' } });
