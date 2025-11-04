/**
 * Manufacturing Orchestrator Server
 * Main entry point - modular architecture
 */

const { app, logger } = require('./src/app');
const { PORT } = require('./src/config');
const { logoutAllTokens } = require('./src/services/authService');
const { loadTokens } = require('./src/db/tokenStore');
const { getCurrentJob } = require('./src/services/jobService');
const { createConnection } = require('./src/db/connection');
const { getPendingCount } = require('./src/db/queries');

// ============================================================================
// GRACEFUL SHUTDOWN HANDLING (for service mode)
// ============================================================================

let server;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn(`Received ${signal} but already shutting down, ignoring...`);
    return;
  }
  isShuttingDown = true;

  logger.info(`============================================================`);
  logger.info(`GRACEFUL SHUTDOWN INITIATED - Signal: ${signal}`);
  logger.info(`============================================================`);

  const currentJob = getCurrentJob();

  // Stop intake - don't start any new work orders
  if (currentJob.status === 'running') {
    logger.info('SHUTDOWN - Job is running, pausing intake (no new WOs will start)');
    currentJob.stopRequested = true;

    // Wait for current work order to complete (with timeout)
    const GRACE_MS = 30000; // 30 seconds
    const deadline = Date.now() + GRACE_MS;
    const startTime = Date.now();

    while (currentJob.status === 'running' && Date.now() < deadline) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      logger.info(`SHUTDOWN - Waiting for current WO to finish... (${elapsed}s elapsed, WO: ${currentJob.currentWO || 'unknown'})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (currentJob.status === 'stopped') {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      logger.info(`SHUTDOWN - Job stopped gracefully after ${elapsed}s`);
    } else {
      logger.warn('SHUTDOWN - Grace period expired, WO may be incomplete');
      logger.warn(`SHUTDOWN - Current WO: ${currentJob.currentWO}, Status: ${currentJob.status}`);
    }
  } else {
    logger.info(`SHUTDOWN - No active job (status: ${currentJob.status})`);
  }

  // Check for pending jobs before cleaning up tokens
  let hasPendingJobs = false;
  try {
    const fs = require('fs').promises;
    const { CONFIG_FILE } = require('./src/config');

    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);

    if (config.database) {
      const connection = await createConnection(config.database);
      const pendingCount = await getPendingCount(connection);
      await connection.end();

      hasPendingJobs = pendingCount > 0;

      if (hasPendingJobs) {
        logger.info(`SHUTDOWN - Found ${pendingCount} pending job(s) - PRESERVING session tokens for resume`);
      }
    }
  } catch (error) {
    logger.warn('SHUTDOWN - Could not check for pending jobs', { error: error.message });
  }

  // Only cleanup tokens if there are NO pending jobs
  if (!hasPendingJobs) {
    try {
      const result = await logoutAllTokens(logger);
      logger.info('SHUTDOWN - Token cleanup complete', result);
    } catch (error) {
      logger.error('SHUTDOWN - Token cleanup error', { error: error.message });
    }
  } else {
    logger.info('SHUTDOWN - Skipping token cleanup to preserve session for job resumption');
  }

  // Close HTTP server and exit
  logger.info('SHUTDOWN - Closing HTTP server');
  if (server) {
    server.close();
  }

  logger.info('SHUTDOWN - Exiting process');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Windows-specific signals for service control
if (process.platform === 'win32') {
  // SIGBREAK is sent by Windows when service stops
  process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));

  logger.info('Windows platform detected - added SIGBREAK handler for service control');
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason: reason,
    reasonType: typeof reason,
    reasonString: String(reason),
    reasonMessage: reason?.message,
    reasonStack: reason?.stack,
    promise: promise
  });
});

// ============================================================================
// START SERVER
// ============================================================================

server = app.listen(PORT, async () => {
  logger.info('='.repeat(60));
  logger.info('MANUFACTURING ORCHESTRATOR PROXY SERVER');
  logger.info('='.repeat(60));
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Web interface: http://localhost:${PORT}/manufacturing-orchestrator.html`);
  logger.info(`Log level: ${logger.getLevel()}`);
  logger.info('CORS enabled - Fishbowl API calls will be proxied');
  logger.info('SSL certificate validation disabled (development mode)');
  logger.info('='.repeat(60));

  // Check for orphaned tokens from previous sessions
  const tokens = await loadTokens();
  if (tokens.length > 0) {
    logger.warn(`Found ${tokens.length} orphaned token(s) from previous session(s)`);

    // Check for pending jobs before cleaning up tokens
    let hasPendingJobs = false;
    try {
      const fs = require('fs').promises;
      const { CONFIG_FILE } = require('./src/config');

      // Load database name from config.json
      const configData = await fs.readFile(CONFIG_FILE, 'utf8');
      const config = JSON.parse(configData);

      if (config.database) {
        const connection = await createConnection(config.database);
        const pendingCount = await getPendingCount(connection);
        await connection.end();

        hasPendingJobs = pendingCount > 0;

        if (hasPendingJobs) {
          logger.info(`STARTUP - Found ${pendingCount} pending job(s) - PRESERVING ${tokens.length} session token(s) for resume`);
        }
      }
    } catch (error) {
      logger.warn('STARTUP - Could not check for pending jobs', { error: error.message });
    }

    // Only cleanup orphaned tokens if there are NO pending jobs
    if (!hasPendingJobs) {
      logger.info('STARTUP - No pending jobs found, cleaning up orphaned tokens...');

      const cleanupResult = await logoutAllTokens(logger);

      if (cleanupResult.loggedOut > 0) {
        logger.info(`STARTUP - Successfully cleaned up ${cleanupResult.loggedOut} orphaned session(s)`);
      }
      if (cleanupResult.failed > 0) {
        logger.warn(`STARTUP - Failed to cleanup ${cleanupResult.failed} session(s) - they may have already expired`);
      }
    } else {
      logger.info('STARTUP - Skipping token cleanup to preserve sessions for job resumption');
    }
  } else {
    logger.info('No orphaned tokens found - starting fresh');
  }

  logger.info('='.repeat(60));
  logger.info('Server ready - Press Ctrl+C to stop');
});
