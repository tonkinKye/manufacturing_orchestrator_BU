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
      // Parse server URL
      const url = new URL(serverUrl);

      // Build login request (Fishbowl REST API format)
      const loginPayload = {
        username: username,
        password: password,
        name: 'Manufacturing Orchestrator',
        description: 'Queue-based work order processing',
        appId: '999999',
        appKey: 'MFG_ORCH_KEY_2024'
      };

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

      // Log full response for debugging
      logger.info('SETUP - Fishbowl login response:', JSON.stringify(response, null, 2));

      // Check for REST API error response
      if (response.status && response.status >= 400) {
        const errorMsg = response.message || 'Login failed';
        logger.warn('SETUP - Fishbowl login failed', { error: errorMsg, status: response.status });
        return res.status(400).json({ error: errorMsg });
      }

      // Check for legacy API error
      if (response.FbiJson?.FbiMsgsRs?.ErrorRs) {
        const errorMsg = response.FbiJson.FbiMsgsRs.ErrorRs.Message || 'Login failed';
        logger.warn('SETUP - Fishbowl login failed', { error: errorMsg });
        return res.status(400).json({ error: errorMsg });
      }

      // Extract token - REST API returns simple { token: "..." } format
      let token = response.token ||
                  response.FbiJson?.Ticket?.Key ||
                  response.FbiJson?.FbiMsgsRs?.LoginRs?.Key;

      if (!token) {
        logger.warn('SETUP - Login succeeded but no token received.');
        return res.status(500).json({ error: 'Login succeeded but no token received. Check server logs.' });
      }

      logger.info('SETUP - Login successful, querying database name...');

      // Query for database name using SELECT DATABASE()
      // REST API uses the SQL query directly in the body with Bearer token
      const dbQuery = 'SELECT DATABASE() as current_db';

      const dbResponse = await new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: '/api/data-query',  // REST API query endpoint
          method: 'GET',  // REST API uses GET with SQL in body
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'text/plain',
            'Content-Length': Buffer.byteLength(dbQuery)
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

        req.write(dbQuery);
        req.end();
      });

      // Extract database name from REST API query result
      // REST API returns array of objects: [{ current_db: "database_name" }]
      let databaseName = null;
      if (Array.isArray(dbResponse) && dbResponse.length > 0) {
        databaseName = dbResponse[0].current_db || dbResponse[0].DATABASE();
      }

      logger.info('SETUP - Database name detected', { database: databaseName });

      // Logout to clean up the test token (REST API)
      // Fire and forget logout (don't wait for response)
      const logoutReq = httpModule.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/logout',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        rejectUnauthorized: false
      }, () => {});
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
