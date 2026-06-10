/**
 * Periodically runs a task on a fixed interval.
 *
 * Guards against overlapping runs: if a sync is still in flight when the timer
 * fires, that tick is skipped instead of stacking up. `start` runs once
 * immediately, then on the interval.
 */
export function createScheduler({ task, intervalMs, logger }) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running) {
      logger?.warn('scheduler_tick_skipped_overlap');
      return;
    }
    running = true;
    try {
      await task();
    } catch (err) {
      logger?.error({ error: err.message }, 'scheduler_task_threw');
    } finally {
      running = false;
    }
  }

  function start() {
    logger?.info({ intervalMs }, 'scheduler_started');
    tick().catch((err) => logger?.error({ error: err.message }, 'scheduler_tick_failed')); // fire immediately on boot
    timer = setInterval(tick, intervalMs);
    return timer;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      logger?.info('scheduler_stopped');
    }
  }

  return { start, stop, tick };
}
