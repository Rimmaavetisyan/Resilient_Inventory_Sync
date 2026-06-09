import { useApiWithRetry } from '../hooks/useApiWithRetry.js';

/** Format an epoch-ms timestamp as a local clock time (or a dash if never). */
function formatUpdatedAt(lastUpdated) {
  if (!lastUpdated) return '—';
  return new Date(lastUpdated).toLocaleTimeString();
}

/**
 * Generic, resilient dashboard panel.
 *
 * Owns its own data lifecycle via useApiWithRetry, so one microservice being
 * down only degrades its own card. Renders distinct loading / error+retry /
 * success states, shows a "last updated" time, auto-refreshes in the
 * background, and offers a manual Refresh.
 */
export function ServicePanel({ title, url, options, renderData }) {
  const { status, data, error, attempt, lastUpdated, isRefreshing, retry, refresh } =
    useApiWithRetry(url, options);
  const isLoading = status === 'idle' || status === 'loading';

  return (
    <section className="panel" data-testid={`panel-${title}`}>
      <header className="panel__header">
        <h2>{title}</h2>
        {isRefreshing && (
          <span className="panel__refreshing" role="status">
            Refreshing…
          </span>
        )}
      </header>

      {isLoading && (
        <p className="panel__loading" role="status">
          Loading{attempt > 0 ? ` — retry ${attempt}…` : '…'}
        </p>
      )}

      {status === 'error' && (
        <div className="panel__error" role="alert">
          <p>
            Couldn’t load {title}: {error?.message}
          </p>
          <button type="button" className="panel__retry" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && (
        <>
          <div className="panel__body">{renderData(data)}</div>

          {/* Soft warning: a background refresh failed but we kept the old data. */}
          {error && (
            <p className="panel__stale" role="alert">
              Couldn’t refresh — showing last known data.
            </p>
          )}

          <footer className="panel__footer">
            <span className="panel__updated">Updated {formatUpdatedAt(lastUpdated)}</span>
            <button
              type="button"
              className="panel__refresh"
              onClick={refresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
