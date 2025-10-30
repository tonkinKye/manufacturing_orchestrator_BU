const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  LOG_FILE: path.join(__dirname, '../../server.log'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO', // ERROR, WARN, INFO, or DEBUG
  CONFIG_FILE: path.join(__dirname, '../../config.json'),
  TOKEN_FILE: path.join(__dirname, '../../active-tokens.json'),

  // Disable SSL certificate validation for self-signed certs (development only!)
  NODE_TLS_REJECT_UNAUTHORIZED: '0'
};
