const { isSetupComplete } = require('../utils/secureConfig');

/**
 * Middleware to enforce setup completion
 * Redirects to setup wizard if configuration is not complete
 */

// Paths that don't require setup
const ALLOWED_PATHS = [
  '/setup.html',
  '/api/setup/status',
  '/api/setup/test-fishbowl',
  '/api/setup/complete',
  '/favicon.ico'
];

function setupEnforcerMiddleware(logger) {
  let setupCompleteCache = null;
  let lastCheck = 0;
  const CACHE_TTL = 5000; // 5 seconds

  return async function (req, res, next) {
    // Allow certain paths without setup
    if (ALLOWED_PATHS.some(path => req.path.startsWith(path))) {
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
        return res.redirect('/setup.html');
      }
    }

    next();
  };
}

module.exports = setupEnforcerMiddleware;
