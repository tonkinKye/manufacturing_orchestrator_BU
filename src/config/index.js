const serverConfig = require('./server');
const databaseConfig = require('./database');

// Apply process environment settings
process.env.NODE_TLS_REJECT_UNAUTHORIZED = serverConfig.NODE_TLS_REJECT_UNAUTHORIZED;

module.exports = {
  ...serverConfig,
  ...databaseConfig
};
