const express = require('express');
const router = express.Router();
const { loadConfig, saveConfig } = require('../utils/secureConfig');

/**
 * Configuration Routes
 */

function setupConfigRoutes(logger) {
  // Save configuration (used by frontend after database detection)
  router.post('/save-config', async (req, res) => {
    const { serverUrl, username, password, database } = req.body;

    logger.info('CONFIG - Saving configuration after database detection...');

    try {
      // Load existing config
      const existingConfig = await loadConfig();

      // Update only the database field, keep other credentials
      const updatedConfig = {
        fishbowl: {
          serverUrl: serverUrl || existingConfig.fishbowl?.serverUrl,
          username: username || existingConfig.fishbowl?.username,
          password: password || existingConfig.fishbowl?.password,
          database: database || existingConfig.fishbowl?.database
        },
        mysql: existingConfig.mysql || {}
      };

      await saveConfig(updatedConfig);
      logger.info('CONFIG - Configuration updated successfully', { database });

      res.json({ success: true });
    } catch (error) {
      logger.error('CONFIG - Failed to save config', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Load configuration (legacy endpoint - redirects to /api/config/load)
  router.get('/load-config', async (req, res) => {
    logger.info('CONFIG - Legacy load-config endpoint called, redirecting to /api/config/load');
    res.redirect('/api/config/load');
  });

  return router;
}

module.exports = setupConfigRoutes;
