const { decrypt } = require('../utils/encryption');

// Legacy encrypted password (fallback)
const LEGACY_PASSWORD_ENCRYPTED = 'e71963f4d621d03a9826635bafc0c669:91229c8e37cf2b34b23fb4082db46b58e7740096c2424a3e8ded85052cc34e6bc714304cb0e0c8d859bfd65135ca7028';

/**
 * Get MySQL password from environment or decrypt legacy password
 */
function getMySQLPassword() {
  // Prefer environment variable
  if (process.env.DB_PASSWORD) {
    return process.env.DB_PASSWORD;
  }
  // Fall back to decrypting legacy password
  return decrypt(LEGACY_PASSWORD_ENCRYPTED);
}

/**
 * Get MySQL configuration with environment variable support
 */
function getMySQLConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: getMySQLPassword()
  };
}

// Expose MYSQL_CONFIG for backward compatibility
const MYSQL_CONFIG = {
  get host() { return process.env.DB_HOST || 'localhost'; },
  get port() { return parseInt(process.env.DB_PORT || '3306', 10); },
  get user() { return process.env.DB_USER || 'root'; },
  get passwordEncrypted() { return LEGACY_PASSWORD_ENCRYPTED; }
};

module.exports = {
  MYSQL_CONFIG,
  getMySQLPassword,
  getMySQLConfig
};
