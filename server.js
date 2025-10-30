/**
 * Manufacturing Orchestrator Server
 * Main entry point - modular architecture
 */

const { app, logger } = require('./src/app');
const { PORT } = require('./src/config');
const { logoutAllTokens } = require('./src/services/authService');
const { loadTokens } = require('./src/db/tokenStore');

// ============================================================================
// GRACEFUL SHUTDOWN HANDLING (for service mode)
// ============================================================================

let server;
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Cleanup all tokens before shutting down
  logoutAllTokens(logger)
    .then(result => {
      logger.info('SHUTDOWN - Token cleanup complete', result);
    })
    .catch(error => {
      logger.error('SHUTDOWN - Token cleanup error', { error: error.message });
    })
    .finally(() => {
      if (server) {
        server.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });

        setTimeout(() => {
          logger.error('Forced shutdown after timeout');
          process.exit(1);
        }, 10000);
      } else {
        process.exit(0);
      }
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

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
  logger.info('CORS enabled - Fishbowl API calls will be proxied');
  logger.info('SSL certificate validation disabled (development mode)');
  logger.info('='.repeat(60));

  // Check for orphaned tokens from previous sessions
  const tokens = await loadTokens();
  if (tokens.length > 0) {
    logger.warn(`Found ${tokens.length} orphaned token(s) from previous session(s)`);
    logger.info('Starting automatic token cleanup...');

    const cleanupResult = await logoutAllTokens(logger);

    if (cleanupResult.loggedOut > 0) {
      logger.info(`Successfully cleaned up ${cleanupResult.loggedOut} orphaned session(s)`);
    }
    if (cleanupResult.failed > 0) {
      logger.warn(`Failed to cleanup ${cleanupResult.failed} session(s) - they may have already expired`);
    }
  } else {
    logger.info('No orphaned tokens found - starting fresh');
  }

  logger.info('='.repeat(60));
  logger.info('Server ready - Press Ctrl+C to stop');
});
