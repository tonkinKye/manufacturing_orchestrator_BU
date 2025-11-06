const express = require('express');
const setupAuthRoutes = require('./auth');
const setupSetupRoutes = require('./setup');
const setupConfigRoutes = require('./config');
const setupMySQLRoutes = require('./mysql');
const setupQueueRoutes = require('./queue');
const setupFishbowlRoutes = require('./fishbowl');
const setupHealthRoutes = require('./health');

/**
 * Route Aggregator
 * Sets up all application routes
 */

function setupRoutes(app, logger) {
  // Health check routes (no auth required, always accessible)
  app.use('/api', setupHealthRoutes(logger));

  // Setup routes (no auth required, always accessible)
  app.use('/api', setupSetupRoutes(logger));

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
