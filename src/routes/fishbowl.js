const express = require('express');
const router = express.Router();
const { fetchWithNode } = require('../utils/helpers');

/**
 * Fishbowl API Proxy Routes
 */

function setupFishbowlRoutes(logger) {
  // Data query
  router.post('/data-query', async (req, res) => {
    const { serverUrl, token, sql } = req.body;

    logger.api('SQL QUERY', {
      serverUrl,
      sqlPreview: sql.substring(0, 100) + '...',
      url: `${serverUrl}/api/data-query`
    });

    try {
      const url = new URL(`${serverUrl}/api/data-query`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? require('https') : require('http');

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
        rejectUnauthorized: false
      };

      const promise = new Promise((resolve, reject) => {
        const apiReq = httpModule.request(options, (apiRes) => {
          let data = '';

          apiRes.on('data', (chunk) => {
            data += chunk;
          });

          apiRes.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const rowCount = Array.isArray(parsed) ? parsed.length : 'N/A';
              logger.api(`SQL QUERY RESPONSE - Status: ${apiRes.statusCode}, Rows: ${rowCount}`);
              resolve(parsed);
            } catch (e) {
              logger.error('SQL QUERY - Invalid JSON response', {
                error: e.message,
                dataPreview: data.substring(0, 500)
              });
              reject(new Error('Invalid JSON response'));
            }
          });
        });

        apiReq.on('error', (error) => {
          reject(error);
        });

        apiReq.write(sql);
        apiReq.end();
      });

      const data = await promise;
      res.json(data);

    } catch (error) {
      logger.error('SQL QUERY ERROR', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // Get original work order structure for disassembly
  router.post('/fishbowl/workorder-structure', async (req, res) => {
    const { serverUrl, token, woNumber } = req.body;

    if (!serverUrl || !token || !woNumber) {
      logger.error('WO STRUCTURE - Missing required parameters', { serverUrl: !!serverUrl, token: !!token, woNumber: !!woNumber });
      return res.status(400).json({ error: 'Missing required parameters: serverUrl, token, woNumber' });
    }

    logger.api('WO STRUCTURE QUERY', {
      serverUrl,
      woNumber
    });

    try {
      const sql = `
        SELECT
          bomitemtype.name AS woitem_type,
          woitem.partId AS partid,
          woitem.qtyUsed AS woitem_qty,
          GROUP_CONCAT(DISTINCT trackinginfosn.serialNum) AS serial_numbers
        FROM wo
        JOIN woitem ON woitem.woid = wo.id
        JOIN bomitemtype ON bomitemtype.id = woitem.typeid
        LEFT JOIN trackinginfo ON trackinginfo.recordId = woitem.id AND trackinginfo.tableid = -355941248
        LEFT JOIN trackinginfosn ON trackinginfosn.trackingInfoId = trackinginfo.id
        WHERE wo.num = '${woNumber.replace(/'/g, "''")}'
          AND woitem.qtyused > 0
        GROUP BY bomitemtype.name, woitem.partId, woitem.qtyUsed
        ORDER BY bomitemtype.name, woitem.partId
      `;

      logger.api('WO STRUCTURE - Executing SQL', { sqlPreview: sql.substring(0, 200) });

      const url = new URL(`${serverUrl}/api/data-query`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? require('https') : require('http');

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
        rejectUnauthorized: false
      };

      const promise = new Promise((resolve, reject) => {
        const apiReq = httpModule.request(options, (apiRes) => {
          let data = '';

          apiRes.on('data', (chunk) => {
            data += chunk;
          });

          apiRes.on('end', () => {
            logger.api(`WO STRUCTURE - Fishbowl response status: ${apiRes.statusCode}`);
            try {
              const parsed = JSON.parse(data);
              logger.api(`WO STRUCTURE RESPONSE - Items: ${Array.isArray(parsed) ? parsed.length : 'N/A'}`);
              if (apiRes.statusCode !== 200) {
                logger.error('WO STRUCTURE - Non-200 status', { statusCode: apiRes.statusCode, response: parsed });
                reject(new Error(`Fishbowl API returned status ${apiRes.statusCode}`));
              } else {
                resolve(parsed);
              }
            } catch (e) {
              logger.error('WO STRUCTURE - Invalid JSON response', { error: e.message, dataPreview: data.substring(0, 500) });
              reject(new Error('Invalid JSON response from Fishbowl'));
            }
          });
        });

        apiReq.on('error', (error) => {
          logger.error('WO STRUCTURE - HTTP request error', { error: error.message });
          reject(error);
        });

        apiReq.write(sql);
        apiReq.end();
      });

      const data = await promise;
      res.json(data);

    } catch (error) {
      logger.error('WO STRUCTURE ERROR', { error: error.message, stack: error.stack, woNumber });
      res.status(500).json({ error: error.message });
    }
  });

  // Legacy API proxy
  router.post('/fishbowl/:endpoint', async (req, res) => {
    const { endpoint } = req.params;
    const { serverUrl, token, payload } = req.body;

    logger.api(`LEGACY API REQUEST: ${endpoint}`, {
      serverUrl,
      url: `${serverUrl}/api/legacy/external/${endpoint}`,
      payloadPreview: payload ? JSON.stringify(payload).substring(0, 300) : 'No payload'
    });

    try {
      const response = await fetchWithNode(`${serverUrl}/api/legacy/external/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      logger.api(`LEGACY API RESPONSE: ${endpoint} - Status: ${response.status}`);

      res.json(data);
    } catch (error) {
      logger.error(`LEGACY API ERROR: ${endpoint}`, { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Generic REST API catch-all proxy (must be LAST!)
  router.use('/', async (req, res, next) => {
    if (req.route) {
      return next();
    }

    const endpoint = req.path.substring(1);
    const { serverUrl, token, method, payload } = req.body;

    const httpMethod = method || req.method;

    logger.api(`REST API REQUEST: ${httpMethod} /api/${endpoint}`, {
      serverUrl,
      url: `${serverUrl}/api/${endpoint}`,
      payloadPreview: payload ? JSON.stringify(payload).substring(0, 300) : null
    });

    try {
      const options = {
        method: httpMethod,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      if (payload && httpMethod !== 'GET') {
        options.body = JSON.stringify(payload);
      }

      const response = await fetchWithNode(`${serverUrl}/api/${endpoint}`, options);

      const data = await response.json();
      logger.api(`REST API RESPONSE: ${httpMethod} /api/${endpoint} - Status: ${response.status}`);

      res.json(data);
    } catch (error) {
      logger.error(`REST API ERROR: /api/${endpoint}`, { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = setupFishbowlRoutes;
