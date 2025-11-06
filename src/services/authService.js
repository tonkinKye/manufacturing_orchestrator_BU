const { fetchWithNode } = require('../utils/helpers');
const { normalizeUrl } = require('../utils/urlHelpers');
const { decrypt } = require('../utils/encryption');
const { loadTokens, addToken, removeToken, saveTokens } = require('../db/tokenStore');

/**
 * Authentication Service
 * Handles login, logout, and token management
 */

/**
 * Login to Fishbowl
 * @param {string} serverUrl - Fishbowl server URL
 * @param {Object} loginData - Login credentials
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Login response with token
 */
async function login(serverUrl, loginData, logger) {
  // Normalize serverUrl (remove trailing slash)
  const normalizedUrl = normalizeUrl(serverUrl);

  logger.api('LOGIN REQUEST', {
    serverUrl,
    username: loginData.username,
    url: `${normalizedUrl}/api/login`
  });

  // Build REST API login payload (only include fields Fishbowl expects)
  const fishbowlPayload = {
    appName: loginData.appName || 'ManufacturingOrchestrator',
    appDescription: loginData.appDescription || 'Queue-based work order processing',
    appId: loginData.appId || 20251022,
    username: loginData.username,
    password: loginData.password
  };

  // Only include mfaCode if provided
  if (loginData.mfaCode) {
    fishbowlPayload.mfaCode = loginData.mfaCode;
  }

  logger.info('LOGIN - Sending to Fishbowl:', {
    url: `${normalizedUrl}/api/login`,
    payload: { ...fishbowlPayload, password: '***' }
  });

  const response = await fetchWithNode(`${normalizedUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fishbowlPayload)
  });

  logger.api(`LOGIN RESPONSE - Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);

  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    logger.error('LOGIN - Received non-JSON response:', text.substring(0, 500));
    throw new Error('Fishbowl returned an error page instead of JSON. Check server URL and port.');
  }

  const data = await response.json();

  // Log the response for debugging
  if (!response.ok) {
    logger.error('LOGIN - Fishbowl rejected login:', {
      status: response.status,
      response: data
    });
  } else {
    logger.info('LOGIN - Success:', {
      hasToken: !!data.token,
      tokenPreview: data.token ? data.token.substring(0, 20) + '...' : 'none'
    });
  }

  // Track the token if login was successful
  if (response.ok && data.token) {
    const tokenCount = await addToken(data.token, serverUrl, loginData.username, loginData.password);
    logger.info(`LOGIN - Token tracked successfully. Total active tokens: ${tokenCount}`);
  }

  return data;
}

/**
 * Logout from Fishbowl and cleanup tokens
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Current auth token
 * @param {Object} logoutData - Logout data
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Logout result
 */
async function logout(serverUrl, token, logoutData, logger) {
  // Normalize serverUrl (remove trailing slash)
  const normalizedUrl = normalizeUrl(serverUrl);

  logger.api('LOGOUT REQUEST - Cleaning up all tracked tokens', { serverUrl });

  // First, try to logout the current token
  if (token) {
    try {
      const response = await fetchWithNode(`${normalizedUrl}/api/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(logoutData)
      });

      if (response.ok) {
        logger.api('LOGOUT - Current session logged out successfully');
        await removeToken(token);
      }
    } catch (error) {
      logger.warn('LOGOUT - Current session logout failed (non-critical)', {
        error: error.message
      });
    }
  }

  // Now logout ALL tracked tokens to clean up any orphaned sessions
  const cleanupResult = await logoutAllTokens(logger);

  logger.api('LOGOUT - Complete', cleanupResult);

  return {
    success: true,
    message: 'Logout complete',
    cleanup: cleanupResult
  };
}

/**
 * Logout all tracked tokens
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Cleanup result
 */
async function logoutAllTokens(logger) {
  const tokens = await loadTokens();

  if (tokens.length === 0) {
    logger.info('TOKEN TRACKING - No active tokens to logout');
    return { success: true, loggedOut: 0, failed: 0 };
  }

  logger.info(`TOKEN TRACKING - Attempting to logout ${tokens.length} token(s)`);

  let loggedOut = 0;
  let failed = 0;
  const remainingTokens = [];

  for (const tokenInfo of tokens) {
    try {
      // Normalize serverUrl (remove trailing slash)
      const normalizedUrl = normalizeUrl(tokenInfo.serverUrl);

      logger.info(`TOKEN TRACKING - Logging out ${tokenInfo.username}@${tokenInfo.serverUrl}`);

      // Decrypt password if available
      let password = '';
      if (tokenInfo.passwordEncrypted) {
        try {
          password = decrypt(tokenInfo.passwordEncrypted);
        } catch (decryptError) {
          logger.warn(`TOKEN TRACKING - Could not decrypt password for ${tokenInfo.username}`);
        }
      }

      const response = await fetchWithNode(`${normalizedUrl}/api/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenInfo.token}`
        },
        body: JSON.stringify({
          appName: 'ManufacturingOrchestrator',
          appId: 20251022,
          username: tokenInfo.username,
          password: password
        })
      });

      if (response.ok) {
        loggedOut++;
        logger.info(`TOKEN TRACKING - Successfully logged out ${tokenInfo.username}`);
      } else {
        failed++;
        logger.warn(`TOKEN TRACKING - Failed to logout ${tokenInfo.username}`, {
          status: response.status
        });
        remainingTokens.push(tokenInfo);
      }
    } catch (error) {
      failed++;
      logger.error(`TOKEN TRACKING - Error logging out ${tokenInfo.username}`, {
        error: error.message
      });
      remainingTokens.push(tokenInfo);
    }
  }

  // Save remaining tokens (ones that failed to logout)
  await saveTokens(remainingTokens);

  logger.info('TOKEN TRACKING - Cleanup complete', {
    loggedOut,
    failed,
    remaining: remainingTokens.length
  });

  return { success: true, loggedOut, failed, remaining: remainingTokens.length };
}

/**
 * Get token status
 * @returns {Promise<Object>} Token status
 */
async function getTokenStatus() {
  const tokens = await loadTokens();

  const sanitizedTokens = tokens.map(t => ({
    username: t.username,
    serverUrl: t.serverUrl,
    createdAt: t.createdAt,
    lastUsed: t.lastUsed,
    tokenPreview: t.token.substring(0, 20) + '...'
  }));

  return {
    activeTokens: tokens.length,
    tokens: sanitizedTokens
  };
}

module.exports = {
  login,
  logout,
  logoutAllTokens,
  getTokenStatus
};
