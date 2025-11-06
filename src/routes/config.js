const express = require('express');
const router = express.Router();
const { getFishbowlConfig, saveFishbowlConfig, isUsingEnvConfig } = require('../config/fishbowl');

/**
 * Configuration Routes
 */

function setupConfigRoutes(logger) {
  // Save configuration
  router.post('/save-config', async (req, res) => {
    const { serverUrl, username, password, database } = req.body;

    logger.info('CONFIG - Saving configuration...');

    // Check if using environment variables
    if (isUsingEnvConfig()) {
      logger.warn('CONFIG - Using environment variables, file save will be ignored at runtime');
      // Still save to file for reference, but warn the user
    }

    try {
      await saveFishbowlConfig(serverUrl, username, password, database);
      logger.info('CONFIG - Configuration saved successfully', { database });

      res.json({
        success: true,
        warning: isUsingEnvConfig() ? 'Configuration saved to file, but environment variables take precedence' : null
      });
    } catch (error) {
      logger.error('CONFIG - Failed to save config', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Load configuration
  router.get('/load-config', async (req, res) => {
    logger.info('CONFIG - Loading configuration...');

    try {
      const config = await getFishbowlConfig();
      logger.info('CONFIG - Configuration loaded successfully', {
        database: config.database,
        source: isUsingEnvConfig() ? 'environment' : 'file'
      });

      res.json({
        ...config,
        _source: isUsingEnvConfig() ? 'environment' : 'file'
      });
    } catch (error) {
      logger.error('CONFIG - Failed to load config', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = setupConfigRoutes;
