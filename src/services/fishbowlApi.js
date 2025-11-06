const { fetchWithNode, getHttpsOptions } = require('../utils/helpers');
const https = require('https');
const http = require('http');

/**
 * Fishbowl API Service
 * Wrapper for Fishbowl API calls
 */

/**
 * Execute a SELECT query against the Fishbowl API
 * @param {string} sql - The SQL query to execute
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Fishbowl auth token
 * @returns {Promise<Array>} Query results
 */
async function fishbowlQuery(sql, serverUrl, token) {
  const url = new URL(`${serverUrl}/api/data-query`);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(sql)
    },
    ...getHttpsOptions()
  };

  return new Promise((resolve, reject) => {
    const apiReq = httpModule.request(options, (apiRes) => {
      let data = '';

      apiRes.on('data', (chunk) => {
        data += chunk;
      });

      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid JSON response from Fishbowl API'));
        }
      });
    });

    apiReq.on('error', (error) => {
      reject(error);
    });

    apiReq.write(sql);
    apiReq.end();
  });
}

/**
 * Call Fishbowl REST API
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} payload - Request payload
 * @returns {Promise<Object>} API response
 */
async function callFishbowlREST(serverUrl, token, endpoint, method = 'POST', payload = null) {
  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  if (payload && method !== 'GET') {
    options.body = JSON.stringify(payload);
  }

  const response = await fetchWithNode(`${serverUrl}/api/${endpoint}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

/**
 * Call Fishbowl Legacy API
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} endpoint - API endpoint
 * @param {Object} payload - Request payload
 * @returns {Promise<Object>} API response
 */
async function callFishbowlLegacy(serverUrl, token, endpoint, payload) {
  const response = await fetchWithNode(`${serverUrl}/api/legacy/external/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

module.exports = {
  fishbowlQuery,
  callFishbowlREST,
  callFishbowlLegacy
};
