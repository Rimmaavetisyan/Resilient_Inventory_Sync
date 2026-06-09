import axios from 'axios';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createHttpClient } from './httpClient.js';
import { createWarehouseApi } from './warehouseApi.js';
import { createPool, createInventoryRepository } from './db.js';
import { createInventoryService } from './inventoryService.js';
import { createScheduler } from './scheduler.js';

/**
 * Composition root: build everything, wire it together, start polling.
 * (Excluded from coverage — pure wiring + process lifecycle.)
 */
function main() {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  const httpClient = createHttpClient({
    axiosInstance: axios.create(),
    logger,
    retryOptions: config.retry,
  });

  const warehouseApi = createWarehouseApi({
    httpClient,
    baseUrl: config.warehouse.baseUrl,
    timeoutMs: config.warehouse.timeoutMs,
  });

  const pool = createPool(config.db.connectionString);
  const repository = createInventoryRepository({ pool, logger });

  const service = createInventoryService({ warehouseApi, repository, logger });

  // `--once` runs a single sync (handy for cron / manual testing) and exits.
  if (process.argv.includes('--once')) {
    service
      .sync()
      .then((result) => {
        logger.info(result, 'one_shot_sync_result');
        return pool.end();
      })
      .then(() => process.exit(0))
      .catch((err) => {
        logger.error({ error: err.message }, 'one_shot_sync_crashed');
        process.exit(1);
      });
    return;
  }

  const scheduler = createScheduler({
    task: () => service.sync(),
    intervalMs: config.poll.intervalMs,
    logger,
  });
  scheduler.start();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting_down');
    scheduler.stop();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
