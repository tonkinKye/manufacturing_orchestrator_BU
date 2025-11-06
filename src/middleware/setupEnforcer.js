const { isSetupComplete } = require('../utils/secureConfig');
const path = require('path');

/**
 * Middleware to enforce setup completion
 * Redirects to setup wizard if configuration is not complete
 */

// Paths and extensions that don't require setup or allowed after setup
const ALLOWED_PATHS = [
  '/setup.html',
  '/config.html',
  '/api/setup/',
  '/api/config/',
  '/favicon.ico'
];

const ALLOWED_EXTENSIONS = [
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot'
];

function setupEnforcerMiddleware(logger) {
  let setupCompleteCache = null;
  let lastCheck = 0;
  const CACHE_TTL = 5000; // 5 seconds

  return async function (req, res, next) {
    // Allow static assets (CSS, JS, images, fonts)
    const ext = path.extname(req.path).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      return next();
    }

    // Allow certain paths without setup
    if (ALLOWED_PATHS.some(allowedPath => req.path.startsWith(allowedPath))) {
      return next();
    }

    // Check if setup is complete (with caching)
    const now = Date.now();
    if (setupCompleteCache === null || now - lastCheck > CACHE_TTL) {
      setupCompleteCache = await isSetupComplete();
      lastCheck = now;
    }

    // If setup not complete, redirect to setup page
    if (!setupCompleteCache) {
      if (req.path.startsWith('/api')) {
        // API requests get 403
        return res.status(403).json({
          error: 'Setup not complete',
          message: 'Please complete initial setup at /setup.html'
        });
      } else {
        // HTML requests get redirected
        logger.info('SETUP - Redirecting to setup wizard (setup not complete)');
        return res.redirect('/setup.html');
      }
    }

    next();
  };
}

module.exports = setupEnforcerMiddleware;
