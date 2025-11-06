const express = require('express');
const router = express.Router();
const { createConnection } = require('../db/connection');
const {
  createMOQueueTable,
  getMOQueueCount,
  deletePendingBarcodes,
  queueWorkOrder,
  batchQueueWorkOrders,
  getScheduledJobs,
  getFailedJobs,
  deleteScheduledJobs,
  clearFailedJobs
} = require('../db/queries');
const { loadConfig } = require('../utils/secureConfig');

/**
 * MySQL Routes
 */

function setupMySQLRoutes(logger) {
  // Initialize queue table
  router.post('/mysql/init-queue-table', async (req, res) => {
    const { database } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    logger.info('MYSQL - Initializing queue table...', { database });

    let connection;

    try {
      connection = await createConnection(database);

      logger.info('MYSQL - Connected successfully');

      const [verifyDbResult] = await connection.query('SELECT DATABASE() as current_db');
      const verifiedDb = verifyDbResult[0].current_db;
      logger.info('MYSQL - Current database: ' + verifiedDb);

      if (verifiedDb !== database) {
        throw new Error(`Database mismatch. Expected: ${database}, Got: ${verifiedDb}`);
      }

      logger.info('MYSQL - Creating mo_queue table (if not exists)...');

      await createMOQueueTable(connection);
      logger.info('MYSQL - Table ready (created or already exists)');

      const rowCount = await getMOQueueCount(connection);

      logger.info(`MYSQL - Table has ${rowCount} row(s)`);

      res.json({
        success: true,
        database: verifiedDb,
        rowCount: rowCount
      });

    } catch (error) {
      logger.error('MYSQL - Database error', { error: error.message });

      let helpfulMessage = error.message;

      if (error.message.includes('Unknown database')) {
        helpfulMessage += '\n\nThe database does not exist. Check that Fishbowl is using the correct database.';
      } else if (error.message.includes('Access denied')) {
        helpfulMessage += '\n\nMySQL credentials in server.js may be incorrect.';
      }

      res.status(500).json({ error: helpfulMessage });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Delete pending barcodes
  router.post('/mysql/delete-pending-barcodes', async (req, res) => {
    const { database, barcodes } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(400).json({ error: 'Barcodes array is required' });
    }

    logger.info('MYSQL - Deleting pending barcodes...', {
      database,
      count: barcodes.length
    });

    let connection;

    try {
      connection = await createConnection(database);

      const result = await deletePendingBarcodes(connection, barcodes);

      if (result.deletedCount === 0) {
        logger.info('MYSQL - No pending records found for given barcodes');
      } else {
        logger.info(`MYSQL - Deleted ${result.deletedCount} pending record(s)`, {
          barcodes: result.barcodes
        });
      }

      res.json({
        success: true,
        deletedCount: result.deletedCount,
        barcodes: result.barcodes
      });

    } catch (error) {
      logger.error('MYSQL - Error deleting pending barcodes', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Check for pending barcodes (without deleting)
  router.post('/mysql/check-pending-barcodes', async (req, res) => {
    const { database, barcodes } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(400).json({ error: 'Barcodes array is required' });
    }

    logger.debug('MYSQL - Checking for pending barcodes...', {
      database,
      count: barcodes.length
    });

    let connection;

    try {
      connection = await createConnection(database);

      const barcodesInClause = barcodes.map(b => `'${b.replace(/'/g, "''")}'`).join(',');

      const [checkResult] = await connection.query(
        `SELECT barcode FROM mo_queue WHERE status = 'Pending' AND barcode IN (${barcodesInClause})`
      );

      const foundBarcodes = checkResult.map(row => row.barcode);
      const foundCount = foundBarcodes.length;

      if (foundCount === 0) {
        logger.debug('MYSQL - No pending records found for given barcodes');
      } else {
        logger.debug(`MYSQL - Found ${foundCount} pending record(s)`, {
          barcodes: foundBarcodes
        });
      }

      res.json({
        success: true,
        foundCount: foundCount,
        barcodes: foundBarcodes
      });

    } catch (error) {
      logger.error('MYSQL - Error checking pending barcodes', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Queue work order
  router.post('/queue-work-order', async (req, res) => {
    const {
      barcode,
      serialNumbers,
      fgLocationId,
      rawGoodsPartId,
      fgPartId,
      bomNum,
      bomId,
      locationGroupId,
      operationType,
      originalWoStructure
    } = req.body;

    if (!barcode || !serialNumbers || !bomNum || !bomId || !locationGroupId || !operationType) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Load database from secure config
    const config = await loadConfig();
    const database = config?.fishbowl?.database;

    if (!database) {
      return res.status(500).json({ error: 'Server configuration not complete' });
    }

    logger.info('QUEUE WORK ORDER - Queueing', { barcode, operationType });

    let connection;

    try {
      connection = await createConnection(database);

      await queueWorkOrder(connection, {
        barcode,
        serialNumbers,
        fgLocationId,
        rawGoodsPartId,
        fgPartId,
        bomNum,
        bomId,
        locationGroupId,
        operationType,
        originalWoStructure
      });

      logger.info(`QUEUE WORK ORDER - Successfully queued ${barcode} for ${operationType}`);

      res.json({ success: true, barcode, operationType });

    } catch (error) {
      logger.error('QUEUE WORK ORDER - Error', { error: error.message, barcode });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Batch queue work orders
  router.post('/mysql/batch-queue-work-orders', async (req, res) => {
    const { database, items, scheduledFor } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    logger.info('MYSQL - Batch queueing work orders...', {
      database,
      count: items.length,
      scheduledFor: scheduledFor || 'immediate'
    });

    let connection;

    try {
      connection = await createConnection(database);

      const insertedCount = await batchQueueWorkOrders(connection, items, scheduledFor);

      logger.info(`MYSQL - Successfully queued ${insertedCount} work order(s)${scheduledFor ? ` for ${scheduledFor}` : ' (immediate)'}`);

      res.json({
        success: true,
        insertedCount: insertedCount,
        scheduledFor: scheduledFor || null
      });

    } catch (error) {
      logger.error('MYSQL - Error batch queueing work orders', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Get scheduled jobs
  router.get('/mysql/scheduled-jobs', async (req, res) => {
    // Load database from secure config
    const config = await loadConfig();
    const database = config?.fishbowl?.database;

    if (!database) {
      return res.status(500).json({ error: 'Server configuration not complete' });
    }

    logger.debug('MYSQL - Getting scheduled jobs...');

    let connection;

    try {
      connection = await createConnection(database);

      const scheduledJobs = await getScheduledJobs(connection);

      logger.debug(`MYSQL - Found ${scheduledJobs.length} scheduled job group(s)`);

      res.json({
        success: true,
        jobs: scheduledJobs
      });

    } catch (error) {
      logger.error('MYSQL - Error getting scheduled jobs', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Get failed jobs
  router.get('/mysql/failed-jobs', async (req, res) => {
    // Load database from secure config
    const config = await loadConfig();
    const database = config?.fishbowl?.database;

    if (!database) {
      return res.status(500).json({ error: 'Server configuration not complete' });
    }

    logger.debug('MYSQL - Getting failed jobs...');

    let connection;

    try {
      connection = await createConnection(database);

      const failedJobs = await getFailedJobs(connection);

      logger.debug(`MYSQL - Found ${failedJobs.length} failed job(s)`);

      res.json({
        success: true,
        jobs: failedJobs
      });

    } catch (error) {
      logger.error('MYSQL - Error getting failed jobs', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Delete scheduled jobs by scheduled_for time
  router.delete('/mysql/scheduled-jobs', async (req, res) => {
    const { scheduledFor } = req.body;

    if (!scheduledFor) {
      return res.status(400).json({ error: 'scheduledFor is required' });
    }

    // Load database from secure config
    const config = await loadConfig();
    const database = config?.fishbowl?.database;

    if (!database) {
      return res.status(500).json({ error: 'Server configuration not complete' });
    }

    // Convert ISO datetime to MySQL format if needed
    let mysqlDateTime = scheduledFor;
    if (scheduledFor.includes('T')) {
      // Convert from ISO format (2025-11-06T17:00:00.000Z) to MySQL format (2025-11-06 17:00:00)
      const date = new Date(scheduledFor);
      mysqlDateTime = date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0') + ':' +
        String(date.getSeconds()).padStart(2, '0');
    }

    logger.info('MYSQL - Deleting scheduled jobs', { scheduledFor: mysqlDateTime });

    let connection;

    try {
      connection = await createConnection(database);

      const deletedCount = await deleteScheduledJobs(connection, mysqlDateTime);

      logger.info(`MYSQL - Deleted ${deletedCount} scheduled job(s) for ${scheduledFor}`);

      res.json({
        success: true,
        deletedCount: deletedCount,
        scheduledFor: scheduledFor
      });

    } catch (error) {
      logger.error('MYSQL - Error deleting scheduled jobs', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Clear failed jobs
  router.delete('/mysql/failed-jobs', async (req, res) => {
    const { ids } = req.body; // Optional array of specific IDs

    // Load database from secure config
    const config = await loadConfig();
    const database = config?.fishbowl?.database;

    if (!database) {
      return res.status(500).json({ error: 'Server configuration not complete' });
    }

    logger.info('MYSQL - Clearing failed jobs', { ids: ids || 'all' });

    let connection;

    try {
      connection = await createConnection(database);

      const clearedCount = await clearFailedJobs(connection, ids);

      logger.info(`MYSQL - Cleared ${clearedCount} failed job(s)`);

      res.json({
        success: true,
        clearedCount: clearedCount
      });

    } catch (error) {
      logger.error('MYSQL - Error clearing failed jobs', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  return router;
}

module.exports = setupMySQLRoutes;
