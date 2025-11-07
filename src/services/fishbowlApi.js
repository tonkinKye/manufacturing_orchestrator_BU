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
  // Remove trailing slash from serverUrl to avoid double slashes
  const cleanServerUrl = serverUrl.replace(/\/$/, '');
  const url = new URL(`${cleanServerUrl}/api/data-query`);
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
          console.error('FISHBOWL API - Invalid JSON response');
          console.error('Requested URL:', `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`);
          console.error('Status Code:', apiRes.statusCode);
          console.error('Headers:', JSON.stringify(apiRes.headers));
          console.error('Raw Response (first 500 chars):', data.substring(0, 500));
          reject(new Error(`Invalid JSON response from Fishbowl API (Status: ${apiRes.statusCode}, Length: ${data.length})`));
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
  // Remove trailing slash from serverUrl to avoid double slashes
  const cleanServerUrl = serverUrl.replace(/\/$/, '');
  const fullUrl = `${cleanServerUrl}/api/${endpoint}`;

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

  const response = await fetchWithNode(fullUrl, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('FISHBOWL REST API - Error');
    console.error('Requested URL:', fullUrl);
    console.error('Status Code:', response.status);
    console.error('Response:', errorText.substring(0, 500));
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
  // Remove trailing slash from serverUrl to avoid double slashes
  const cleanServerUrl = serverUrl.replace(/\/$/, '');
  const fullUrl = `${cleanServerUrl}/api/legacy/external/${endpoint}`;

  const response = await fetchWithNode(fullUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('FISHBOWL LEGACY API - Error');
    console.error('Requested URL:', fullUrl);
    console.error('Status Code:', response.status);
    console.error('Response:', errorText.substring(0, 500));
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

module.exports = {
  fishbowlQuery,
  callFishbowlREST,
  callFishbowlLegacy
};
