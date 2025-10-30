const express = require('express');
const Logger = require('./utils/logger');
const { LOG_FILE, LOG_LEVEL } = require('./config');
const setupMiddleware = require('./middleware');
const setupRoutes = require('./routes');

/**
 * Express Application Setup
 */

// Create logger instance
const logger = new Logger(LOG_FILE, LOG_LEVEL);

// Create Express app
const app = express();

// Setup middleware
setupMiddleware(app, logger);

// Setup routes
setupRoutes(app, logger);

module.exports = {
  app,
  logger
};
