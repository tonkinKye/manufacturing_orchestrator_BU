/**
 * Database query functions for mo_queue table
 */

/**
 * Create mo_queue table if it doesn't exist
 * @param {Connection} connection - MySQL connection
 */
async function createMOQueueTable(connection) {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS mo_queue (
      id INT AUTO_INCREMENT PRIMARY KEY,
      datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      mo_number VARCHAR(50),
      barcode VARCHAR(100),
      serial_numbers TEXT,
      fg_location VARCHAR(100),
      raw_goods_part_id INT,
      fg_part_id INT,
      bom_num VARCHAR(50),
      bom_id INT,
      location_group_id INT,
      operation_type VARCHAR(20) DEFAULT 'build',
      status VARCHAR(20) DEFAULT 'Pending',
      wo_number VARCHAR(50),
      error_message TEXT,
      retry_count INT DEFAULT 0,
      original_wo_structure LONGTEXT,
      INDEX idx_status (status),
      INDEX idx_mo_number (mo_number),
      INDEX idx_barcode (barcode),
      INDEX idx_bom_num (bom_num)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  await connection.query(createTableSQL);

  // Add column to existing tables if it doesn't exist
  // Check if column exists first (IF NOT EXISTS only works in MySQL 8.0.23+)
  const [columns] = await connection.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mo_queue'
      AND COLUMN_NAME = 'original_wo_structure'
  `);

  if (columns.length === 0) {
    await connection.query(`
      ALTER TABLE mo_queue
      ADD COLUMN original_wo_structure LONGTEXT
    `);
  }

  // Add wo_number index if it doesn't exist (improves query performance for job resumption)
  const [indexes] = await connection.query(`
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mo_queue'
      AND INDEX_NAME = 'idx_wo_number'
  `);

  if (indexes.length === 0) {
    await connection.query(`
      ALTER TABLE mo_queue
      ADD INDEX idx_wo_number (wo_number)
    `);
  }

  // Add scheduled_for column if it doesn't exist (allows scheduling jobs for future execution)
  const [scheduledForColumn] = await connection.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mo_queue'
      AND COLUMN_NAME = 'scheduled_for'
  `);

  if (scheduledForColumn.length === 0) {
    await connection.query(`
      ALTER TABLE mo_queue
      ADD COLUMN scheduled_for DATETIME NULL AFTER status,
      ADD INDEX idx_scheduled_for (scheduled_for)
    `);
  }
}

/**
 * Get count of rows in mo_queue
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<number>} Row count
 */
async function getMOQueueCount(connection) {
  const [countResult] = await connection.query('SELECT COUNT(*) as count FROM mo_queue');
  return countResult[0].count;
}

/**
 * Get pending items from mo_queue that are ready to process
 * Only returns items where scheduled_for is NULL or <= current time
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<Array>} Pending items ready to process
 */
async function getPendingItems(connection) {
  const [pendingItems] = await connection.query(`
    SELECT * FROM mo_queue
    WHERE status = 'Pending'
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())
    ORDER BY id
  `);
  return pendingItems;
}

/**
 * Get pending count (ready to process)
 * Only counts items where scheduled_for is NULL or <= current time
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<number>} Pending count ready to process
 */
async function getPendingCount(connection) {
  const [pendingItems] = await connection.query(`
    SELECT COUNT(*) as count FROM mo_queue
    WHERE status = 'Pending'
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())
  `);
  return pendingItems[0].count;
}

/**
 * Get total pending count (including scheduled items not yet ready)
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<number>} Total pending count
 */
async function getTotalPendingCount(connection) {
  const [result] = await connection.query(`
    SELECT COUNT(*) as count FROM mo_queue WHERE status = 'Pending'
  `);
  return result[0].count;
}

/**
 * Get scheduled count (items scheduled for future)
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<number>} Scheduled count
 */
async function getScheduledCount(connection) {
  const [result] = await connection.query(`
    SELECT COUNT(*) as count FROM mo_queue
    WHERE status = 'Pending' AND scheduled_for > NOW()
  `);
  return result[0].count;
}

/**
 * Delete pending barcodes
 * @param {Connection} connection - MySQL connection
 * @param {Array<string>} barcodes - Barcodes to delete
 * @returns {Promise<Object>} Result with deletedCount and barcodes
 */
async function deletePendingBarcodes(connection, barcodes) {
  const barcodesInClause = barcodes.map(b => `'${b.replace(/'/g, "''")}'`).join(',');

  const [checkResult] = await connection.query(
    `SELECT barcode FROM mo_queue WHERE status = 'Pending' AND barcode IN (${barcodesInClause})`
  );

  const foundCount = checkResult.length;

  if (foundCount === 0) {
    return { deletedCount: 0, barcodes: [] };
  }

  const [deleteResult] = await connection.query(
    `DELETE FROM mo_queue WHERE status = 'Pending' AND barcode IN (${barcodesInClause})`
  );

  const deletedBarcodes = checkResult.map(row => row.barcode);

  return {
    deletedCount: deleteResult.affectedRows,
    barcodes: deletedBarcodes
  };
}

/**
 * Queue a work order
 * @param {Connection} connection - MySQL connection
 * @param {Object} params - Work order parameters
 */
async function queueWorkOrder(connection, params) {
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
    originalWoStructure,
    scheduledFor
  } = params;

  const insertSQL = `
    INSERT INTO mo_queue
    (datetime, mo_number, barcode, serial_numbers, fg_location, raw_goods_part_id, fg_part_id, bom_num, bom_id, location_group_id, operation_type, status, scheduled_for, wo_number, error_message, retry_count, original_wo_structure)
    VALUES (NOW(), NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, NULL, NULL, 0, ?)
  `;

  await connection.query(insertSQL, [
    barcode,
    serialNumbers,
    fgLocationId ? fgLocationId.toString() : null,
    rawGoodsPartId,
    fgPartId,
    bomNum,
    bomId,
    locationGroupId,
    operationType,
    scheduledFor || null,
    originalWoStructure || null
  ]);
}

/**
 * Batch queue work orders
 * @param {Connection} connection - MySQL connection
 * @param {Array<Object>} items - Array of work order items
 * @param {string|null} scheduledFor - Optional datetime string for scheduling (applies to all items)
 * @returns {Promise<number>} Number of inserted records
 */
async function batchQueueWorkOrders(connection, items, scheduledFor = null) {
  if (!items || items.length === 0) {
    return 0;
  }

  const insertSQL = `
    INSERT INTO mo_queue
    (datetime, mo_number, barcode, serial_numbers, fg_location, raw_goods_part_id, bom_num, bom_id, location_group_id, status, scheduled_for, wo_number, error_message, retry_count)
    VALUES ?
  `;

  // Build values array - each item is an array of values
  const values = items.map(item => [
    new Date(), // datetime
    null, // mo_number
    item.barcode,
    item.serialNumbers, // Already JSON string
    item.fgLocation,
    item.rawGoodsPartId,
    item.bomNum,
    item.bomId,
    item.locationGroupId,
    'Pending', // status
    scheduledFor, // scheduled_for
    null, // wo_number
    null, // error_message
    0 // retry_count
  ]);

  const [result] = await connection.query(insertSQL, [values]);
  return result.affectedRows;
}

/**
 * Get scheduled jobs grouped by scheduled_for time
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<Array>} Scheduled jobs grouped by time
 */
async function getScheduledJobs(connection) {
  const [jobs] = await connection.query(`
    SELECT
      scheduled_for,
      COUNT(*) as count,
      MIN(datetime) as first_queued,
      MAX(datetime) as last_queued
    FROM mo_queue
    WHERE status = 'Pending' AND scheduled_for IS NOT NULL
    GROUP BY scheduled_for
    ORDER BY scheduled_for ASC
  `);
  return jobs;
}

/**
 * Get failed jobs (status = 'Failed')
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<Array>} Failed jobs
 */
async function getFailedJobs(connection) {
  const [jobs] = await connection.query(`
    SELECT
      id,
      barcode,
      wo_number,
      error_message,
      retry_count,
      scheduled_for,
      datetime
    FROM mo_queue
    WHERE status = 'Failed'
    ORDER BY datetime DESC
    LIMIT 100
  `);
  return jobs;
}

/**
 * Delete scheduled jobs by scheduled_for time
 * @param {Connection} connection - MySQL connection
 * @param {string} scheduledFor - Scheduled datetime to delete
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteScheduledJobs(connection, scheduledFor) {
  const [result] = await connection.query(
    `DELETE FROM mo_queue WHERE status = 'Pending' AND scheduled_for = ?`,
    [scheduledFor]
  );
  return result.affectedRows;
}

/**
 * Clear failed jobs (delete them from the table)
 * @param {Connection} connection - MySQL connection
 * @param {Array<number>} ids - Optional array of specific IDs to clear
 * @returns {Promise<number>} Number of cleared records
 */
async function clearFailedJobs(connection, ids = null) {
  if (ids && Array.isArray(ids) && ids.length > 0) {
    const [result] = await connection.query(
      `DELETE FROM mo_queue WHERE status = 'Failed' AND id IN (?)`,
      [ids]
    );
    return result.affectedRows;
  } else {
    // Clear all failed jobs
    const [result] = await connection.query(
      `DELETE FROM mo_queue WHERE status = 'Failed'`
    );
    return result.affectedRows;
  }
}

module.exports = {
  createMOQueueTable,
  getMOQueueCount,
  getPendingItems,
  getPendingCount,
  getTotalPendingCount,
  getScheduledCount,
  deletePendingBarcodes,
  queueWorkOrder,
  batchQueueWorkOrders,
  getScheduledJobs,
  getFailedJobs,
  deleteScheduledJobs,
  clearFailedJobs
};
