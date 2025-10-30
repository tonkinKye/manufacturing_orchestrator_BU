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
 * Get pending items from mo_queue
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<Array>} Pending items
 */
async function getPendingItems(connection) {
  const [pendingItems] = await connection.query(
    "SELECT * FROM mo_queue WHERE status = 'Pending' ORDER BY id"
  );
  return pendingItems;
}

/**
 * Get pending count
 * @param {Connection} connection - MySQL connection
 * @returns {Promise<number>} Pending count
 */
async function getPendingCount(connection) {
  const [pendingItems] = await connection.query(
    "SELECT COUNT(*) as count FROM mo_queue WHERE status = 'Pending'"
  );
  return pendingItems[0].count;
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
    originalWoStructure
  } = params;

  const insertSQL = `
    INSERT INTO mo_queue
    (datetime, mo_number, barcode, serial_numbers, fg_location, raw_goods_part_id, fg_part_id, bom_num, bom_id, location_group_id, operation_type, status, wo_number, error_message, retry_count, original_wo_structure)
    VALUES (NOW(), NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NULL, NULL, 0, ?)
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
    originalWoStructure || null
  ]);
}

module.exports = {
  createMOQueueTable,
  getMOQueueCount,
  getPendingItems,
  getPendingCount,
  deletePendingBarcodes,
  queueWorkOrder
};
