const express = require('express');
const cors = require('cors');
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

  // Error handler (must be last)
  app.use(errorHandler(logger));
}

module.exports = setupMiddleware;
