const express = require('express');
const router = express.Router();
const { createConnection } = require('../db/connection');
const { getPendingCount } = require('../db/queries');
const jobService = require('../services/jobService');
const queueService = require('../services/queueService');
const { fishbowlQuery } = require('../services/fishbowlApi');

/**
 * Queue Management Routes
 */

function setupQueueRoutes(logger) {
  // Get queue status
  router.get('/queue-status', (req, res) => {
    logger.info('STATUS - Queue status requested');
    res.json(jobService.getJobStatus());
  });

  // Stop queue processing
  router.post('/stop-queue-processing', (req, res) => {
    logger.info('STOP - Stop requested for current job');

    try {
      const result = jobService.requestStop();
      logger.info('STOP - Stop flag set, job will pause after current item completes');
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Clear pending jobs
  router.post('/clear-pending-jobs', async (req, res) => {
    const { serverUrl, token, database } = req.body;

    if (!serverUrl || !token || !database) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    logger.info('CLEAR - Clearing pending jobs and closing short MOs', { database });

    let connection;

    try {
      // First, close short any MOs
      const closeShortResult = await queueService.closeShortPendingJobs(serverUrl, token, database, logger);

      // Then delete all pending records from mo_queue
      connection = await createConnection(database);

      const [deleteResult] = await connection.query(
        "DELETE FROM mo_queue WHERE status = 'Pending' OR status = 'closed_short'"
      );

      logger.info(`CLEAR - Deleted ${deleteResult.affectedRows} record(s) from mo_queue`);

      // Reset job status
      jobService.resetJob();
      logger.info('CLEAR - Job status reset to idle');

      res.json({
        success: true,
        closedShortCount: closeShortResult.closedShortCount,
        deletedCount: deleteResult.affectedRows,
        failedMOs: closeShortResult.failedMOs
      });

    } catch (error) {
      logger.error('CLEAR - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Check pending jobs
  router.post('/check-pending-jobs', async (req, res) => {
    const { database } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Missing database parameter' });
    }

    logger.info('PENDING JOBS - Checking for pending queue items', { database });

    let connection;

    try {
      connection = await createConnection(database);

      const pendingCount = await getPendingCount(connection);

      logger.info(`PENDING JOBS - Found ${pendingCount} pending item(s)`);

      res.json({
        success: true,
        hasPendingJobs: pendingCount > 0,
        pendingCount: pendingCount
      });

    } catch (error) {
      logger.error('PENDING JOBS - Error checking pending jobs', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Get BOM and location info from pending jobs
  router.post('/get-pending-job-info', async (req, res) => {
    const { database } = req.body;

    if (!database) {
      return res.status(400).json({ error: 'Missing database parameter' });
    }

    logger.info('PENDING JOB INFO - Getting BOM and location from pending items', { database });

    let connection;

    try {
      connection = await createConnection(database);

      const [rows] = await connection.query(
        'SELECT bom_num, bom_id, location_group_id FROM mo_queue WHERE status = "Pending" LIMIT 1'
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'No pending items found in queue' });
      }

      const bomNum = rows[0].bom_num;
      const bomId = rows[0].bom_id;
      const locationGroupId = rows[0].location_group_id;

      logger.info(`PENDING JOB INFO - Retrieved: BOM=${bomNum}, Location Group=${locationGroupId}`);

      res.json({
        success: true,
        bomNum: bomNum,
        bomId: bomId,
        locationGroupId: locationGroupId
      });

    } catch (error) {
      logger.error('PENDING JOB INFO - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Close short pending jobs
  router.post('/close-short-pending-jobs', async (req, res) => {
    const { serverUrl, token, database } = req.body;

    if (!serverUrl || !token || !database) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    logger.info('CLOSE SHORT - Starting close short for pending jobs', { database });

    try {
      const result = await queueService.closeShortPendingJobs(serverUrl, token, database, logger);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('CLOSE SHORT - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Check MO sequence
  router.post('/check-mo-sequence', async (req, res) => {
    const { database, serverUrl, token, bom } = req.body;

    if (!database || !serverUrl || !token || !bom) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    logger.info('MO SEQUENCE - Checking for existing MOs', { database, bom });

    try {
      // Generate date string for today
      const today = new Date();
      const dateStr = today.getFullYear().toString().slice(2) +
                     String(today.getMonth() + 1).padStart(2, '0') +
                     String(today.getDate()).padStart(2, '0');

      const moPattern = `${bom}|${dateStr}|%`;

      logger.info('MO SEQUENCE - Querying pattern:', { pattern: moPattern });

      // Get ALL matching MOs from Fishbowl API
      const moSql = `SELECT num FROM mo WHERE num LIKE '${moPattern.replace(/'/g, "''")}'`;
      const existingMOs = await fishbowlQuery(moSql, serverUrl, token);

      let startingSequence = 1;
      let lastMO = null;

      if (existingMOs.length > 0) {
        logger.info(`MO SEQUENCE - Found ${existingMOs.length} existing MO(s) for today`);

        // Parse all sequence numbers and find the maximum numerically
        const sequences = existingMOs
          .map(row => {
            const parts = row.num.split('|');
            if (parts.length === 3) {
              const seq = parseInt(parts[2], 10);
              return { seq: seq, num: row.num };
            }
            return { seq: 0, num: row.num };
          })
          .filter(item => item.seq > 0);

        if (sequences.length > 0) {
          const maxItem = sequences.reduce((max, item) =>
            item.seq > max.seq ? item : max
          );

          lastMO = maxItem.num;
          startingSequence = maxItem.seq + 1;
          logger.info(`MO SEQUENCE - Last MO: ${lastMO} (sequence ${maxItem.seq}), continuing from ${startingSequence}`);
        }
      } else {
        logger.info('MO SEQUENCE - No existing MOs for today, starting from 1');
      }

      res.json({
        success: true,
        startingSequence: startingSequence,
        dateStr: dateStr,
        lastMO: lastMO,
        existingCount: existingMOs.length
      });

    } catch (error) {
      logger.error('MO SEQUENCE - Error checking sequence', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get finished goods on hand (for disassembly)
  router.post('/get-finished-goods-on-hand', async (req, res) => {
    const { database, serverUrl, token, bomNum, bomId } = req.body;

    if (!database || !serverUrl || !token || !bomNum || !bomId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    logger.info('FINISHED GOODS - Fetching on-hand for disassembly', { bomNum });

    let connection;

    try {
      // Step 1: Get the finished good part ID from BOM using Fishbowl API
      const bomSql = `
        SELECT bomitem.partid
        FROM bom
        JOIN bomitem ON bomitem.bomid = bom.id AND bomitem.typeid = 10
        WHERE bom.num = '${bomNum.replace(/'/g, "''")}' AND bom.id = ${bomId}
      `;

      const bomRows = await fishbowlQuery(bomSql, serverUrl, token);

      if (!bomRows || bomRows.length === 0) {
        throw new Error(`BOM ${bomNum} not found or has no finished good item`);
      }

      const fgPartId = bomRows[0].partid;

      // Step 2: Get on-hand FG inventory from Fishbowl API
      const fgSql = `
        SELECT DISTINCT
          sn.SerialNum AS barcode,
          p.id AS fg_part_id,
          p.num AS fg_part_num,
          p.description AS fg_description,
          l.name AS location_name,
          lg.name AS location_group_name,
          CONCAT(lg.name, '-', l.name) AS full_location
        FROM part p
        JOIN tag t ON t.partid = p.id
        JOIN serial s ON s.tagid = t.id
        JOIN serialnum sn ON sn.serialid = s.id AND sn.parttrackingid = 5
        JOIN location l ON l.id = t.locationid
        JOIN locationgroup lg ON lg.id = l.locationgroupid
        WHERE p.id = ${fgPartId}
          AND t.qty > 0
      `;

      const fgRows = await fishbowlQuery(fgSql, serverUrl, token);

      if (!fgRows || fgRows.length === 0) {
        logger.info('FINISHED GOODS - No on-hand FGs found');
        return res.json({ finishedGoods: [] });
      }

      // Step 3: Get mo_queue build records via MySQL2
      connection = await createConnection(database);

      const [queueRows] = await connection.query(`
        SELECT barcode, serial_numbers, wo_number, datetime, bom_num,
               ROW_NUMBER() OVER (PARTITION BY barcode ORDER BY datetime DESC) AS rn
        FROM mo_queue
        WHERE status = 'Success'
          AND operation_type = 'build'
          AND bom_num = ?
      `, [bomNum]);

      // Step 4: Join the results in JavaScript
      const buildRecords = new Map();
      queueRows.forEach(row => {
        if (row.rn === 1) { // Only most recent build per barcode
          buildRecords.set(row.barcode, {
            serial_numbers: row.serial_numbers,
            wo_number: row.wo_number,
            build_date: row.datetime
          });
        }
      });

      // Filter FGs to only those with build records
      const results = fgRows
        .filter(fg => buildRecords.has(fg.barcode))
        .map(fg => ({
          ...fg,
          serial_numbers: buildRecords.get(fg.barcode).serial_numbers,
          wo_number: buildRecords.get(fg.barcode).wo_number,
          build_date: buildRecords.get(fg.barcode).build_date
        }))
        .sort((a, b) => new Date(b.build_date) - new Date(a.build_date));

      logger.info(`FINISHED GOODS - Found ${results.length} on-hand finished good(s) for disassembly`);

      res.json({ finishedGoods: results });

    } catch (error) {
      logger.error('FINISHED GOODS - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });

  // Get raw goods
  router.post('/get-raw-goods', async (req, res) => {
    const { serverUrl, token, bomNum } = req.body;

    if (!serverUrl || !token || !bomNum) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    logger.info('RAW GOODS - Fetching for BOM', { bomNum });

    try {
      const sql = `
        SELECT DISTINCT
          part.num AS part_num,
          part.id AS part_id,
          CONCAT(part.num,' - ',part.description) AS list_values
        FROM bom
        JOIN bomitem ON bomitem.bomId = bom.id
        JOIN part ON part.id = bomitem.partid
        JOIN parttotracking ON parttotracking.partid = bomitem.partid
        JOIN parttracking ON parttracking.id = parttotracking.parttrackingid
        WHERE bom.num = '${bomNum.replace(/'/g, "''")}'
          AND bomitem.typeid = 20
          AND parttracking.typeid = 40
        ORDER BY part.num
      `;

      const data = await fishbowlQuery(sql, serverUrl, token);
      logger.info(`RAW GOODS - Found ${Array.isArray(data) ? data.length : 0} raw good(s)`);
      res.json(data);

    } catch (error) {
      logger.error('RAW GOODS - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get locations
  router.post('/get-locations', async (req, res) => {
    const { serverUrl, token, locationGroupId } = req.body;

    if (!serverUrl || !token || !locationGroupId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    logger.info('LOCATIONS - Fetching for location group', { locationGroupId });

    try {
      const sql = `
        SELECT
          location.id AS location_id,
          locationgroup.id AS locationgroup_id,
          CONCAT(locationgroup.name,' - ',location.name) AS list_value,
          location.name AS location_name,
          locationgroup.name AS locationgroup_name
        FROM locationgroup
        JOIN location ON location.locationgroupid = locationgroup.id
        WHERE locationgroup.id = ${locationGroupId}
          AND location.activeflag = 1
          AND location.receivable = 1
        ORDER BY location.name
      `;

      const data = await fishbowlQuery(sql, serverUrl, token);
      logger.info(`LOCATIONS - Found ${Array.isArray(data) ? data.length : 0} location(s)`);
      res.json({ locations: data });

    } catch (error) {
      logger.error('LOCATIONS - Error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Start queue processing
  router.post('/start-queue-processing', async (req, res) => {
    const { serverUrl, token, database, bom, bomId, locationGroup } = req.body;

    if (!serverUrl || !token || !database || !bom || !bomId || !locationGroup) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Check if a job is already running
    const currentStatus = jobService.getJobStatus();
    if (currentStatus.status === 'running') {
      return res.status(409).json({ error: 'A job is already running' });
    }

    logger.info('QUEUE PROCESSING - Start requested', { database, bom, locationGroup });

    // Start job
    jobService.startJob();

    // Return immediately - processing happens in background
    res.json({
      success: true,
      message: 'Queue processing started',
      jobId: jobService.getJobStatus().startTime
    });

    // Start background processing
    setImmediate(() => {
      queueService.processQueueBackground(serverUrl, token, database, bom, bomId, locationGroup, logger)
        .catch(error => {
          logger.error('QUEUE PROCESSING - Fatal error', { error: error.message });
          const currentJob = jobService.getCurrentJob();
          currentJob.status = 'error';
          currentJob.error = error.message;
          currentJob.endTime = new Date().toISOString();
        });
    });
  });

  return router;
}

module.exports = setupQueueRoutes;
