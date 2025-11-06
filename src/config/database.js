const { loadConfig } = require('../utils/secureConfig');

let cachedMySQLConfig = null;

/**
 * Get MySQL configuration from secure encrypted config
 * Uses Windows DPAPI for encryption key protection
 */
async function getMySQLConfig() {
  try {
    const config = await loadConfig();
    cachedMySQLConfig = config.mysql || {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: ''
    };
    return cachedMySQLConfig;
  } catch (error) {
    // Setup not complete - return defaults
    return {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: ''
    };
  }
}

/**
 * Get MySQL password from secure config
 */
async function getMySQLPassword() {
  const config = await getMySQLConfig();
  return config.password;
}

// Expose MYSQL_CONFIG for backward compatibility (synchronous access)
// Note: This requires setup to be complete before server starts
const MYSQL_CONFIG = {
  get host() { return cachedMySQLConfig?.host || 'localhost'; },
  get port() { return cachedMySQLConfig?.port || 3306; },
  get user() { return cachedMySQLConfig?.user || 'root'; }
};

module.exports = {
  MYSQL_CONFIG,
  getMySQLPassword,
  getMySQLConfig
};
