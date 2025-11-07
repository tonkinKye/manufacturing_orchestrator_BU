const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  LOG_FILE: path.join(__dirname, '../../server.log'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO', // ERROR, WARN, INFO, or DEBUG
  CONFIG_FILE: path.join(__dirname, '../../config.json'),
  TOKEN_FILE: path.join(__dirname, '../../active-tokens.json'),

  // TLS certificate validation - configurable via environment variable
  // Set NODE_TLS_REJECT_UNAUTHORIZED=false for development with self-signed certs
  // Set NODE_TLS_REJECT_UNAUTHORIZED=true (or omit) for production
  NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined
    ? process.env.NODE_TLS_REJECT_UNAUTHORIZED
    : '0', // Default to permissive for backward compatibility

  // UI inactivity timeout
  UI_INACTIVITY_TIMEOUT_MINUTES: parseInt(process.env.UI_INACTIVITY_TIMEOUT_MINUTES) || 2,
  UI_INACTIVITY_TIMEOUT_MS: (parseInt(process.env.UI_INACTIVITY_TIMEOUT_MINUTES) || 2) * 60 * 1000
};
