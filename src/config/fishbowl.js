const { loadConfig } = require('../utils/secureConfig');

/**
 * Get Fishbowl configuration from secure encrypted config
 * Uses Windows DPAPI for encryption key protection
 */
async function getFishbowlConfig() {
  try {
    const config = await loadConfig();
    return config.fishbowl || {};
  } catch (error) {
    // Setup not complete or config doesn't exist
    return {};
  }
}

module.exports = {
  getFishbowlConfig
};
