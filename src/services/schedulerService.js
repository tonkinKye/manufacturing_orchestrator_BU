/**
 * Scheduler Service
 * Automatically processes scheduled jobs when their scheduled time arrives
 * Checks every minute for jobs scheduled for the current hour
 */

const { createConnection } = require('../db/connection');
const { getPendingItems } = require('../db/queries');
const { processQueueBackground } = require('./queueService');
const { loadConfig } = require('../utils/secureConfig');
const { logger } = require('../app');
const { login, logout } = require('./authService');
const { getCurrentJob, startJob } = require('./jobService');
const { SCHEDULER_CHECK_INTERVAL_MS } = require('../config');
const { isUISessionActive } = require('./uiSessionService');

let schedulerInterval = null;
let schedulerStartupTimeout = null;
let isChecking = false;

/**
 * Start the scheduler
 * Checks every minute for jobs that are due to run
 */
function startScheduler() {
  if (schedulerInterval) {
    logger.warn('SCHEDULER - Already running');
    return;
  }

  logger.info('SCHEDULER - Starting automatic job scheduler');

  // Calculate delay until next interval boundary based on configured interval
  const now = new Date();
  const intervalSeconds = SCHEDULER_CHECK_INTERVAL_MS / 1000;
  const currentTimeMs = now.getSeconds() * 1000 + now.getMilliseconds();
  const msIntoInterval = currentTimeMs % SCHEDULER_CHECK_INTERVAL_MS;
  const msUntilNextInterval = msIntoInterval === 0 ? SCHEDULER_CHECK_INTERVAL_MS : SCHEDULER_CHECK_INTERVAL_MS - msIntoInterval;
  const secondsUntilNext = Math.ceil(msUntilNextInterval / 1000);

  logger.info(`SCHEDULER - Will start checking in ${secondsUntilNext} seconds (at next ${intervalSeconds}s interval boundary)`);

  // Wait until the next interval boundary, then start checking at regular intervals
  schedulerStartupTimeout = setTimeout(() => {
    schedulerStartupTimeout = null;
    logger.info(`SCHEDULER - Starting checks at ${intervalSeconds}s interval boundary`);

    // Check immediately at the interval boundary
    checkForScheduledJobs();

    // Then check at configured interval
    schedulerInterval = setInterval(() => {
      checkForScheduledJobs();
    }, SCHEDULER_CHECK_INTERVAL_MS);

    logger.info(`SCHEDULER - Automatic job scheduler started (checks every ${intervalSeconds} seconds)`);
  }, msUntilNextInterval);
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (schedulerStartupTimeout) {
    clearTimeout(schedulerStartupTimeout);
    schedulerStartupTimeout = null;
    logger.info('SCHEDULER - Startup timeout cleared');
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('SCHEDULER - Automatic job scheduler stopped');
  }
}

/**
 * Check for scheduled jobs that are due to run and automatically execute them
 */
async function checkForScheduledJobs() {
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  logger.info(`SCHEDULER - Check started at ${timeStr}`);

  // Prevent overlapping checks
  if (isChecking) {
    logger.warn('SCHEDULER - Previous check still running, skipping this cycle');
    return;
  }

  isChecking = true;

  try {
    // Check if a job is already running
    const currentJob = getCurrentJob();
    if (currentJob.status === 'running') {
      logger.info('SCHEDULER - Job already running, skipping check');
      return;
    }

    // Check if UI is actively logged in
    if (isUISessionActive()) {
      logger.info('SCHEDULER - UI session is active, skipping scheduled job processing');
      return;
    }

    logger.info('SCHEDULER - Loading configuration...');

    // Load config to get database and credentials
    const config = await loadConfig();

    logger.info('SCHEDULER - Configuration loaded', {
      hasConfig: !!config,
      hasFishbowl: !!config?.fishbowl,
      configKeys: config ? Object.keys(config) : []
    });

    const database = config?.fishbowl?.database;
    const serverUrl = config?.fishbowl?.serverUrl;
    const username = config?.fishbowl?.username;
    const password = config?.fishbowl?.password;

    if (!database || !serverUrl || !username || !password) {
      logger.warn('SCHEDULER - Configuration incomplete, skipping check', {
        hasDatabase: !!database,
        hasServerUrl: !!serverUrl,
        hasUsername: !!username,
        hasPassword: !!password
      });
      return;
    }

    logger.info('SCHEDULER - Configuration complete, checking database for scheduled jobs...');

    // Connect to database
    logger.info(`SCHEDULER - Connecting to database: ${database}`);
    const connection = await createConnection(database);
    logger.info('SCHEDULER - Database connection established');

    try {
      // Get jobs scheduled that are ready to run
      logger.info('SCHEDULER - Querying for scheduled jobs ready to run...');

      // Add timeout to prevent query from hanging indefinitely
      const queryPromise = connection.query(`
        SELECT COUNT(*) as count FROM mo_queue
        WHERE status = 'Pending'
          AND scheduled_for IS NOT NULL
          AND scheduled_for <= NOW()
      `);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
      );

      const [scheduledJobs] = await Promise.race([queryPromise, timeoutPromise]);

      const count = scheduledJobs[0].count;
      logger.info(`SCHEDULER - Query complete. Found ${count} scheduled job(s) ready to run`);

      if (count > 0) {
        const now = new Date();
        const hourMinute = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        logger.info(`SCHEDULER - Found ${count} scheduled job(s) ready to run at ${hourMinute}`);
        logger.info(`SCHEDULER - Starting automatic execution`);

        // Get the first pending item to extract BOM and location group info
        logger.info('SCHEDULER - Fetching pending job details...');

        const detailsQueryPromise = connection.query(`
          SELECT bom_num, bom_id, location_group_id
          FROM mo_queue
          WHERE status = 'Pending'
            AND scheduled_for IS NOT NULL
            AND scheduled_for <= NOW()
          LIMIT 1
        `);

        const detailsTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Details query timeout after 10 seconds')), 10000)
        );

        const [pendingItems] = await Promise.race([detailsQueryPromise, detailsTimeoutPromise]);

        if (pendingItems.length === 0) {
          logger.warn('SCHEDULER - No pending items found after count check');
          return;
        }

        const firstItem = pendingItems[0];
        const { bom_num, bom_id, location_group_id } = firstItem;

        logger.info(`SCHEDULER - Processing queue with BOM: ${bom_num}, Location Group: ${location_group_id}`);

        // Login to Fishbowl
        logger.info(`SCHEDULER - Logging in to Fishbowl at ${serverUrl}`);
        const loginResult = await login(serverUrl, {
          username: username,
          password: password,
          appName: 'ManufacturingOrchestrator',
          appDescription: 'Scheduled queue processing',
          appId: 20251022
        }, logger);

        if (!loginResult.token) {
          throw new Error('Failed to obtain Fishbowl token');
        }

        const token = loginResult.token;
        logger.info('SCHEDULER - Login successful, starting job tracking');

        // Start job tracking (triggered by scheduler)
        startJob(null, 'scheduler');
        logger.info('SCHEDULER - Job tracking started');

        // Start background processing (runs async, doesn't block)
        logger.info('SCHEDULER - Launching background queue processing...');
        setImmediate(async () => {
          try {
            logger.info('SCHEDULER - Background processing started');
            await processQueueBackground(serverUrl, token, database, bom_num, bom_id, location_group_id, logger);

            logger.info('SCHEDULER - Queue processing completed successfully');

            // Logout after completion
            try {
              logger.info('SCHEDULER - Logging out from Fishbowl');
              await logout(serverUrl, token, logger);
              logger.info('SCHEDULER - Logged out successfully');
            } catch (logoutError) {
              logger.error('SCHEDULER - Logout failed (non-critical)', { error: logoutError.message });
            }
          } catch (processingError) {
            logger.error('SCHEDULER - Queue processing failed', { error: processingError.message, stack: processingError.stack });

            // Still try to logout
            try {
              await logout(serverUrl, token, logger);
            } catch (logoutError) {
              logger.error('SCHEDULER - Logout failed after error', { error: logoutError.message });
            }

            // Update job status
            const job = getCurrentJob();
            job.status = 'error';
            job.error = processingError.message;
            job.endTime = new Date().toISOString();
          }
        });

      } else {
        // Log every check when no jobs are ready (to see scheduler is working)
        logger.info(`SCHEDULER - Check completed at ${timeStr}, no jobs ready to run`);
      }

    } finally {
      logger.info('SCHEDULER - Releasing database connection');
      if (connection && connection.release) {
        connection.release();
      } else if (connection && connection.end) {
        await connection.end();
      }
    }

  } catch (error) {
    logger.error('SCHEDULER - Error checking for scheduled jobs', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    isChecking = false;
    logger.info('SCHEDULER - Check cycle complete');
  }
}

/**
 * Get scheduler status
 * @returns {Object} Status information
 */
function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    isChecking: isChecking,
    checkIntervalMs: SCHEDULER_CHECK_INTERVAL_MS
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkForScheduledJobs,
  getSchedulerStatus
};
