const fs = require('fs').promises;
const { TOKEN_FILE } = require('../config');
const { encrypt } = require('../utils/encryption');

/**
 * Load tokens from file
 * @returns {Promise<Array>} Array of token objects
 */
async function loadTokens() {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // File doesn't exist yet
    }
    console.error('TOKEN TRACKING - Error loading tokens', { error: error.message });
    return [];
  }
}

/**
 * Save tokens to file
 * @param {Array} tokens - Array of token objects
 */
async function saveTokens(tokens) {
  try {
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch (error) {
    console.error('TOKEN TRACKING - Error saving tokens', { error: error.message });
  }
}

/**
 * Add a token to the store
 * @param {string} token - Auth token
 * @param {string} serverUrl - Server URL
 * @param {string} username - Username
 * @param {string} password - Password (will be encrypted)
 * @returns {Promise<number>} Total number of active tokens
 */
async function addToken(token, serverUrl, username, password) {
  const tokens = await loadTokens();

  // Check if token already exists
  const existingIndex = tokens.findIndex(t => t.token === token);

  if (existingIndex === -1) {
    tokens.push({
      token: token,
      serverUrl: serverUrl,
      username: username,
      passwordEncrypted: encrypt(password), // Store encrypted password for cleanup
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    });

    await saveTokens(tokens);
  } else {
    // Update lastUsed if it already exists
    tokens[existingIndex].lastUsed = new Date().toISOString();
    await saveTokens(tokens);
  }

  return tokens.length;
}

/**
 * Remove a token from the store
 * @param {string} token - Auth token to remove
 * @returns {Promise<boolean>} True if token was removed
 */
async function removeToken(token) {
  const tokens = await loadTokens();
  const filtered = tokens.filter(t => t.token !== token);

  if (filtered.length < tokens.length) {
    await saveTokens(filtered);
    return true;
  }

  return false;
}

module.exports = {
  loadTokens,
  saveTokens,
  addToken,
  removeToken
};
