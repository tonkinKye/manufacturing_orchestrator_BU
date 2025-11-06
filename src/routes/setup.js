const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const {
  isSetupComplete,
  saveConfig,
  loadConfig,
  updateConfigSection,
  clearConfig,
  getConfigStatus
} = require('../utils/secureConfig');

/**
 * Setup and Configuration Management Routes
 */

function setupSetupRoutes(logger) {
  /**
   * GET /api/setup/status
   * Check if initial setup is complete
   */
  router.get('/setup/status', async (req, res) => {
    try {
      const status = await getConfigStatus();
      res.json(status);
    } catch (error) {
      logger.error('SETUP - Failed to get status', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/setup/test-fishbowl
   * Test Fishbowl connection and fetch database name
   */
  router.post('/setup/test-fishbowl', async (req, res) => {
    const { serverUrl, username, password } = req.body;

    if (!serverUrl || !username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    logger.info('SETUP - Testing Fishbowl connection...');

    try {
      // Build login request
      const loginPayload = {
        FbiJson: {
          Ticket: {
            Key: ''
          },
          FbiMsgsRq: {
            LoginRq: {
              IAID: '999999',
              IAName: 'Manufacturing Orchestrator',
              IADescription: 'Queue-based work order processing',
              UserName: username,
              UserPassword: password
            }
          }
        }
      };

      // Parse server URL
      const url = new URL(serverUrl);

      // Determine which module to use based on protocol
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      logger.info(`SETUP - Using ${url.protocol} to connect to ${url.hostname}:${url.port || (isHttps ? 443 : 80)}`);

      // Make HTTP/HTTPS request
      const response = await new Promise((resolve, reject) => {
        const postData = JSON.stringify(loginPayload);

        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: '/api/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          // Allow self-signed certificates (only for HTTPS)
          rejectUnauthorized: false
        };

        const req = httpModule.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (err) {
              reject(new Error('Invalid JSON response from Fishbowl'));
            }
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Connection timeout'));
        });

        req.write(postData);
        req.end();
      });

      // Check for errors
      if (response.FbiJson?.FbiMsgsRs?.ErrorRs) {
        const errorMsg = response.FbiJson.FbiMsgsRs.ErrorRs.Message || 'Login failed';
        logger.warn('SETUP - Fishbowl login failed', { error: errorMsg });
        return res.status(400).json({ error: errorMsg });
      }

      // Extract token from login response
      const token = response.FbiJson?.Ticket?.Key;
      if (!token) {
        logger.warn('SETUP - Login succeeded but no token received');
        return res.status(500).json({ error: 'Login succeeded but no token received' });
      }

      logger.info('SETUP - Login successful, querying database name...');

      // Query for database name using SELECT DATABASE()
      const dbQueryPayload = {
        FbiJson: {
          Ticket: {
            Key: token
          },
          FbiMsgsRq: {
            ExecuteQueryRq: {
              Query: 'SELECT DATABASE() as current_db'
            }
          }
        }
      };

      const dbResponse = await new Promise((resolve, reject) => {
        const postData = JSON.stringify(dbQueryPayload);

        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: '/api/query',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          rejectUnauthorized: false
        };

        const req = httpModule.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(new Error('Invalid JSON response from database query'));
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Database query timeout'));
        });

        req.write(postData);
        req.end();
      });

      // Extract database name from query result
      let databaseName = null;
      const rows = dbResponse.FbiJson?.FbiMsgsRs?.ExecuteQueryRs?.Rows?.Row;
      if (rows) {
        const rowArray = Array.isArray(rows) ? rows : [rows];
        if (rowArray.length > 0 && rowArray[0].current_db) {
          databaseName = rowArray[0].current_db;
        }
      }

      logger.info('SETUP - Database name detected', { database: databaseName });

      // Logout to clean up the test token
      const logoutPayload = {
        FbiJson: {
          Ticket: {
            Key: token
          },
          FbiMsgsRq: {
            LogoutRq: {}
          }
        }
      };

      // Fire and forget logout (don't wait for response)
      const logoutReq = httpModule.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/logout',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(JSON.stringify(logoutPayload))
        },
        rejectUnauthorized: false
      }, () => {});
      logoutReq.write(JSON.stringify(logoutPayload));
      logoutReq.end();

      logger.info('SETUP - Test complete, token cleaned up');

      res.json({
        success: true,
        database: databaseName,
        message: 'Connection successful'
      });
    } catch (error) {
      logger.error('SETUP - Fishbowl connection test failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/setup/complete
   * Complete initial setup with all credentials
   */
  router.post('/setup/complete', async (req, res) => {
    const { fishbowl, mysql } = req.body;

    // Validate required fields
    if (!fishbowl?.serverUrl || !fishbowl?.username || !fishbowl?.password) {
      return res.status(400).json({ error: 'Missing Fishbowl credentials' });
    }

    if (!mysql?.host || !mysql?.user || !mysql?.password) {
      return res.status(400).json({ error: 'Missing MySQL credentials' });
    }

    logger.info('SETUP - Saving initial configuration...');

    try {
      // Save encrypted configuration
      await saveConfig({
        fishbowl: {
          serverUrl: fishbowl.serverUrl,
          username: fishbowl.username,
          password: fishbowl.password,
          database: fishbowl.database || null
        },
        mysql: {
          host: mysql.host,
          port: mysql.port || 3306,
          user: mysql.user,
          password: mysql.password
        }
      });

      logger.info('SETUP - Configuration saved successfully');

      res.json({
        success: true,
        message: 'Setup complete'
      });
    } catch (error) {
      logger.error('SETUP - Failed to save configuration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/config/load
   * Load current configuration (passwords masked for security)
   */
  router.get('/config/load', async (req, res) => {
    try {
      const setupComplete = await isSetupComplete();

      if (!setupComplete) {
        return res.json({});
      }

      const config = await loadConfig();

      // Mask passwords
      const masked = {
        fishbowl: {
          serverUrl: config.fishbowl?.serverUrl || '',
          username: config.fishbowl?.username || '',
          password: config.fishbowl?.password ? '••••••••' : '',
          database: config.fishbowl?.database || ''
        },
        mysql: {
          host: config.mysql?.host || 'localhost',
          port: config.mysql?.port || 3306,
          user: config.mysql?.user || 'root',
          password: config.mysql?.password ? '••••••••' : ''
        }
      };

      res.json(masked);
    } catch (error) {
      logger.error('CONFIG - Failed to load configuration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/config/update
   * Update specific configuration fields
   */
  router.post('/config/update', async (req, res) => {
    const { section, data } = req.body;

    if (!section || !data) {
      return res.status(400).json({ error: 'Missing section or data' });
    }

    if (section !== 'fishbowl' && section !== 'mysql') {
      return res.status(400).json({ error: 'Invalid section' });
    }

    logger.info('CONFIG - Updating configuration', { section });

    try {
      // Load current config
      const config = await loadConfig();

      // Update only provided fields (don't replace masked passwords)
      const updated = { ...config[section] };

      for (const [key, value] of Object.entries(data)) {
        // Skip if password is still masked
        if (key === 'password' && value === '••••••••') {
          continue;
        }
        updated[key] = value;
      }

      // Save updated section
      await updateConfigSection(section, updated);

      logger.info('CONFIG - Configuration updated successfully', { section });

      res.json({
        success: true,
        message: 'Configuration updated'
      });
    } catch (error) {
      logger.error('CONFIG - Failed to update configuration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/config/clear
   * Clear all configuration (factory reset)
   */
  router.post('/config/clear', async (req, res) => {
    logger.info('CONFIG - Clearing all configuration...');

    try {
      await clearConfig();

      logger.info('CONFIG - Configuration cleared successfully');

      res.json({
        success: true,
        message: 'Configuration cleared'
      });
    } catch (error) {
      logger.error('CONFIG - Failed to clear configuration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = setupSetupRoutes;
