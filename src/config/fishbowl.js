const fs = require('fs').promises;
const path = require('path');
const { encrypt, decrypt } = require('../utils/encryption');

const CONFIG_FILE = path.join(__dirname, '../../config.json');

/**
 * Get Fishbowl configuration from environment variables or config.json
 * Priority: Environment variables > config.json
 */
async function getFishbowlConfig() {
  // Try to get from environment variables first
  if (process.env.FISHBOWL_SERVER_URL) {
    return {
      serverUrl: process.env.FISHBOWL_SERVER_URL,
      username: process.env.FISHBOWL_USERNAME,
      password: process.env.FISHBOWL_PASSWORD,
      database: process.env.FISHBOWL_DATABASE || null
    };
  }

  // Fall back to config.json
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);

    // Decrypt password if it exists
    if (config.password) {
      config.password = decrypt(config.password);
    }

    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Config file doesn't exist
      return {};
    }
    throw error;
  }
}

/**
 * Save Fishbowl configuration to config.json
 * Note: Environment variables take precedence, so saving to file won't override them
 */
async function saveFishbowlConfig(serverUrl, username, password, database) {
  const config = {
    serverUrl: serverUrl,
    username: username,
    password: encrypt(password),
    database: database || null
  };

  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Check if Fishbowl config is loaded from environment variables
 */
function isUsingEnvConfig() {
  return !!(process.env.FISHBOWL_SERVER_URL);
}

module.exports = {
  getFishbowlConfig,
  saveFishbowlConfig,
  isUsingEnvConfig,
  CONFIG_FILE
};
