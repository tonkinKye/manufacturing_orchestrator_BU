/**
 * Fetch wrapper that works with both Node.js native fetch and node-fetch
 */

const https = require('https');
const constants = require('../config/constants');

// Create HTTPS agent with configurable SSL verification
const httpsAgent = new https.Agent({
  rejectUnauthorized: constants.SSL_VERIFY
});

/**
 * Fetch wrapper with SSL configuration support
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithNode(url, options = {}) {
  let fetch;
  try {
    fetch = globalThis.fetch;
  } catch {
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
  }

  // Add HTTPS agent for SSL configuration if URL is HTTPS
  if (url.startsWith('https://')) {
    options.agent = httpsAgent;
  }

  return fetch(url, options);
}

/**
 * Get HTTPS request options with SSL configuration
 * @returns {Object} Options object with rejectUnauthorized setting
 */
function getHttpsOptions() {
  return {
    rejectUnauthorized: constants.SSL_VERIFY
  };
}

module.exports = {
  fetchWithNode,
  getHttpsOptions
};
