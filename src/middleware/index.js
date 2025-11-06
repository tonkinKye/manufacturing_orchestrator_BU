const express = require('express');
const cors = require('cors');
const setupEnforcerMiddleware = require('./setupEnforcer');
const errorHandler = require('./errorHandler');

/**
 * Middleware Setup
 */

function setupMiddleware(app, logger) {
  // CORS
  app.use(cors());

  // Body parsing
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Static files - serve from public directory
  app.use(express.static('public'));

  // Also serve images from root
  app.use('/images', express.static('images'));

  // Setup enforcer - redirect to setup wizard if not configured
  app.use(setupEnforcerMiddleware(logger));

  // Error handler (must be last)
  app.use(errorHandler(logger));
}

module.exports = setupMiddleware;
