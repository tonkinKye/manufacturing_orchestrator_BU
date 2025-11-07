const serverConfig = require('./server');
const databaseConfig = require('./database');
const schedulerConfig = require('./scheduler');

// Apply process environment settings
process.env.NODE_TLS_REJECT_UNAUTHORIZED = serverConfig.NODE_TLS_REJECT_UNAUTHORIZED;

module.exports = {
  ...serverConfig,
  ...databaseConfig,
  ...schedulerConfig
};
