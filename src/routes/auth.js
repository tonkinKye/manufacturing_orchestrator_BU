const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { loadTokens } = require('../db/tokenStore');
const { loadConfig } = require('../utils/secureConfig');
const uiSessionService = require('../services/uiSessionService');

/**
 * Authentication Routes
 */

function setupAuthRoutes(logger) {
  // Login
  router.post('/login', async (req, res) => {
    try {
      // Load credentials from secure storage (don't trust frontend)
      const config = await loadConfig();

      if (!config?.fishbowl?.serverUrl || !config?.fishbowl?.username || !config?.fishbowl?.password) {
        return res.status(400).json({ error: 'Configuration not found. Please complete setup first.' });
      }

      logger.info('LOGIN - Using credentials from secure storage');

      // Use credentials from secure storage
      const loginData = {
        appName: req.body.appName || 'ManufacturingOrchestrator',
        appDescription: req.body.appDescription || 'Queue-based work order processing',
        appId: req.body.appId || 20251022,
        username: config.fishbowl.username,
        password: config.fishbowl.password,
        mfaCode: req.body.mfaCode || ''
      };

      const data = await authService.login(config.fishbowl.serverUrl, loginData, logger);

      // Track UI session if login was successful
      if (data.token) {
        uiSessionService.startUISession(data.token);
        logger.info('UI SESSION - Started for token:', data.token.substring(0, 20) + '...');
      }

      res.json(data);
    } catch (error) {
      logger.error('LOGIN ERROR', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // Logout
  router.post('/logout', async (req, res) => {
    const { serverUrl, token, ...logoutData } = req.body;

    try {
      const result = await authService.logout(serverUrl, token, logoutData, logger);

      // End UI session
      uiSessionService.endUISession();
      logger.info('UI SESSION - Ended');

      res.json(result);
    } catch (error) {
      logger.error('LOGOUT ERROR', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Manual token cleanup
  router.post('/cleanup-tokens', async (req, res) => {
    logger.info('TOKEN CLEANUP - Manual cleanup requested');

    try {
      const result = await authService.logoutAllTokens(logger);
      res.json(result);
    } catch (error) {
      logger.error('TOKEN CLEANUP - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get token status
  router.get('/token-status', async (req, res) => {
    try {
      const status = await authService.getTokenStatus();
      res.json(status);
    } catch (error) {
      logger.error('TOKEN STATUS - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Activity heartbeat - update last activity time
  router.post('/activity-heartbeat', async (req, res) => {
    try {
      uiSessionService.updateActivity();
      res.json({ success: true });
    } catch (error) {
      logger.error('ACTIVITY HEARTBEAT - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get UI session status
  router.get('/ui-session-status', async (req, res) => {
    try {
      const session = uiSessionService.getUISession();
      const { UI_INACTIVITY_TIMEOUT_MS } = require('../config');
      res.json({
        isActive: session.isActive,
        inactivityTimeoutMs: UI_INACTIVITY_TIMEOUT_MS
      });
    } catch (error) {
      logger.error('UI SESSION STATUS - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = setupAuthRoutes;
