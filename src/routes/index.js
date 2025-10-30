const express = require('express');
const setupAuthRoutes = require('./auth');
const setupConfigRoutes = require('./config');
const setupMySQLRoutes = require('./mysql');
const setupQueueRoutes = require('./queue');
const setupFishbowlRoutes = require('./fishbowl');

/**
 * Route Aggregator
 * Sets up all application routes
 */

function setupRoutes(app, logger) {
  // Authentication routes
  app.use('/api', setupAuthRoutes(logger));

  // Configuration routes
  app.use('/api', setupConfigRoutes(logger));

  // MySQL routes
  app.use('/api', setupMySQLRoutes(logger));

  // Queue management routes
  app.use('/api', setupQueueRoutes(logger));

  // Fishbowl proxy routes (must be last as it has catch-all)
  app.use('/api', setupFishbowlRoutes(logger));
}

module.exports = setupRoutes;
