const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const { CONFIG_FILE } = require('../config');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * Configuration Routes
 */

function setupConfigRoutes(logger) {
  // Save configuration
  router.post('/save-config', async (req, res) => {
    const { serverUrl, username, password, database } = req.body;

    logger.info('CONFIG - Saving configuration...');

    try {
      const config = {
        serverUrl: serverUrl,
        username: username,
        password: encrypt(password),
        database: database || null
      };

      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
      logger.info('CONFIG - Configuration saved successfully', { database });

      res.json({ success: true });
    } catch (error) {
      logger.error('CONFIG - Failed to save config', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Load configuration
  router.get('/load-config', async (req, res) => {
    logger.info('CONFIG - Loading configuration...');

    try {
      const configData = await fs.readFile(CONFIG_FILE, 'utf8');
      const config = JSON.parse(configData);

      if (config.password) {
        config.password = decrypt(config.password);
      }

      logger.info('CONFIG - Configuration loaded successfully', { database: config.database });

      res.json(config);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('CONFIG - No config file found (first run)');
        res.json({});
      } else {
        logger.error('CONFIG - Failed to load config', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    }
  });

  return router;
}

module.exports = setupConfigRoutes;
