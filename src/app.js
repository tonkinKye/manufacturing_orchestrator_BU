const express = require('express');
const Logger = require('./utils/logger');
const { LOG_FILE } = require('./config');
const setupMiddleware = require('./middleware');
const setupRoutes = require('./routes');

/**
 * Express Application Setup
 */

// Create logger instance
const logger = new Logger(LOG_FILE);

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
