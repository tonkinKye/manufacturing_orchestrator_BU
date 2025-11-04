/**
 * Database helper functions
 * Reusable database operations to avoid code duplication
 */

/**
 * Assign WO numbers to queue items for a given MO
 * This is used during partial MO resumption to map WOs to queue items
 *
 * @param {Connection} connection - MySQL connection
 * @param {string} moNum - Manufacturing Order number
 * @param {Array} batch - Current batch items being processed
 * @param {Array} woRows - Work order rows from Fishbowl (format: [{num: 'WO123'}])
 * @param {string} logPrefix - Prefix for log messages (e.g., 'DISASSEMBLY' or 'BACKGROUND PROCESSOR')
 * @param {Object} logger - Logger instance
 * @returns {Promise<void>}
 */
async function assignWONumbersToQueueItems(connection, moNum, batch, woRows, logPrefix, logger) {
  // Check which items need WO number assignment
  const itemsWithoutWO = batch.filter(item => !item.wo_number);

  if (itemsWithoutWO.length === 0) {
    logger.debug(`${logPrefix} - All items already have WO numbers assigned`);
    return;
  }

  logger.info(`${logPrefix} - ${itemsWithoutWO.length} items need WO number assignment`);
  logger.debug(`${logPrefix} - Building barcode to WO mapping`);

  // Get all items for this MO to understand the full picture
  const [allMOItems] = await connection.query(
    `SELECT id, barcode, wo_number FROM mo_queue WHERE mo_number = ? ORDER BY id`,
    [moNum]
  );

  logger.debug(`${logPrefix} - Total items for MO ${moNum}: ${allMOItems.length}, WOs available: ${woRows.length}`);

  // Collect all updates to batch them
  const updates = [];
  let woIndex = 0;

  // Assign WO numbers to items that don't have them yet
  for (const moItem of allMOItems) {
    if (!moItem.wo_number && woIndex < woRows.length) {
      const woNum = woRows[woIndex].num;

      // Collect update for batching
      updates.push({ id: moItem.id, woNum, barcode: moItem.barcode });

      // Update the batch item if it's in our current batch
      const batchItem = batch.find(item => item.id === moItem.id);
      if (batchItem) {
        batchItem.wo_number = woNum;
      }
    }
    woIndex++;
  }

  // Execute all updates in a batch (more efficient than individual queries)
  if (updates.length > 0) {
    for (const update of updates) {
      await connection.query(
        `UPDATE mo_queue SET wo_number = ? WHERE id = ?`,
        [update.woNum, update.id]
      );
      logger.debug(`${logPrefix} - Assigned WO ${update.woNum} to queue item ${update.id} (barcode: ${update.barcode})`);
    }
  }

  logger.info(`${logPrefix} - WO numbers assigned to all items for MO ${moNum}`);
}

/**
 * Batch update queue items with parameterized queries
 * Safely updates multiple items avoiding SQL injection
 *
 * @param {Connection} connection - MySQL connection
 * @param {string} moNumber - MO number to assign
 * @param {Array} batchIds - Array of queue item IDs
 * @returns {Promise<void>}
 */
async function batchUpdateMONumber(connection, moNumber, batchIds) {
  if (!batchIds || batchIds.length === 0) {
    return;
  }

  // Use parameterized query with placeholders
  const placeholders = batchIds.map(() => '?').join(',');
  await connection.query(
    `UPDATE mo_queue SET mo_number = ? WHERE id IN (${placeholders})`,
    [moNumber, ...batchIds]
  );
}

module.exports = {
  assignWONumbersToQueueItems,
  batchUpdateMONumber
};
