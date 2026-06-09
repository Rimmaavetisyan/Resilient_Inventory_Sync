import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler } from '../src/scheduler.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('createScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('runs immediately on start, then on each interval', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler({ task, intervalMs: 1000, logger });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0); 
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(3);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(3); 
  });

  it('skips a tick if the previous run is still in flight', async () => {
    let resolveTask;
    const task = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveTask = resolve; })
    );
    const scheduler = createScheduler({ task, intervalMs: 1000, logger });

    scheduler.tick(); 
    await scheduler.tick(); 
    expect(task).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('scheduler_tick_skipped_overlap');

    resolveTask();
  });

  it('logs and swallows task errors so the loop keeps running', async () => {
    const task = vi.fn().mockRejectedValue(new Error('kaboom'));
    const scheduler = createScheduler({ task, intervalMs: 1000, logger });

    await scheduler.tick();

    expect(logger.error).toHaveBeenCalledWith({ error: 'kaboom' }, 'scheduler_task_threw');
  });
});
