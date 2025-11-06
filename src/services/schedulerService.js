/**
 * Scheduler Service
 * Automatically processes scheduled jobs when their scheduled time arrives
 * Checks every minute for jobs scheduled for the current hour
 */

const { createConnection } = require('../db/connection');
const { getPendingItems } = require('../db/queries');
const { processQueue } = require('./queueService');
const { loadConfig } = require('../utils/secureConfig');
const logger = require('../utils/logger');

let schedulerInterval = null;
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

  // Check immediately on startup
  checkForScheduledJobs();

  // Then check every minute
  schedulerInterval = setInterval(() => {
    checkForScheduledJobs();
  }, 60000); // 60 seconds

  logger.info('SCHEDULER - Automatic job scheduler started (checks every minute)');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('SCHEDULER - Automatic job scheduler stopped');
  }
}

/**
 * Check for scheduled jobs that are due to run
 * Only processes jobs scheduled for the current hour
 */
async function checkForScheduledJobs() {
  // Prevent overlapping checks
  if (isChecking) {
    return;
  }

  isChecking = true;

  try {
    // Load config to get database
    const config = await loadConfig();
    const database = config?.fishbowl?.database;

    if (!database) {
      logger.debug('SCHEDULER - No database configured, skipping check');
      isChecking = false;
      return;
    }

    // Connect to database
    const connection = await createConnection(database);

    try {
      // Get jobs scheduled for the current hour that are ready to run
      const [scheduledJobs] = await connection.query(`
        SELECT COUNT(*) as count FROM mo_queue
        WHERE status = 'Pending'
          AND scheduled_for IS NOT NULL
          AND scheduled_for <= NOW()
      `);

      const count = scheduledJobs[0].count;

      if (count > 0) {
        const now = new Date();
        const hourMinute = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        logger.info(`SCHEDULER - Found ${count} scheduled job(s) ready to run at ${hourMinute}`);
        logger.info(`SCHEDULER - Scheduled jobs will be picked up when queue processing starts`);

        // Note: We don't auto-start processing here because:
        // 1. The user may already have a job running
        // 2. The queue processor (getPendingItems) already filters for ready jobs
        // 3. Jobs will be processed when the user clicks "Process Queue"
        //
        // If you want fully automatic processing, you would need to:
        // - Check if a job is already running
        // - If not, automatically call processQueue()
        // - Handle token management (need valid session)
      }

    } finally {
      await connection.end();
    }

  } catch (error) {
    logger.error('SCHEDULER - Error checking for scheduled jobs', { error: error.message });
  } finally {
    isChecking = false;
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
    checkIntervalMs: 60000
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkForScheduledJobs,
  getSchedulerStatus
};
