const express = require('express');
const router = express.Router();
const { createConnection } = require('../db/connection');
const { createMOQueueTable, getMOQueueCount, deletePendingBarcodes, queueWorkOrder, batchQueueWorkOrders } = require('../db/queries');

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

  // Queue work order
  router.post('/queue-work-order', async (req, res) => {
    const {
      database,
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

    if (!database || !barcode || !serialNumbers || !bomNum || !bomId || !locationGroupId || !operationType) {
      return res.status(400).json({ error: 'Missing required parameters' });
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
    const { database, items } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    logger.info('MYSQL - Batch queueing work orders...', {
      database,
      count: items.length
    });

    let connection;

    try {
      connection = await createConnection(database);

      const insertedCount = await batchQueueWorkOrders(connection, items);

      logger.info(`MYSQL - Successfully queued ${insertedCount} work order(s)`);

      res.json({
        success: true,
        insertedCount: insertedCount
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

  return router;
}

module.exports = setupMySQLRoutes;
