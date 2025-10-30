const { createConnection } = require('../db/connection');
const { getPendingItems } = require('../db/queries');
const { fishbowlQuery, callFishbowlREST } = require('./fishbowlApi');
const { processWorkOrder } = require('./workOrderService');
const { getCurrentJob } = require('./jobService');

/**
 * Queue Service
 * Handles queue processing logic
 */

/**
 * Process disassembly batch
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} database - Database name
 * @param {Connection} connection - MySQL connection
 * @param {Array} batch - Batch items
 * @param {string} bom - BOM number
 * @param {number} bomId - BOM ID
 * @param {string} locationGroup - Location group ID
 * @param {string} moNum - MO number
 * @param {string} dateStr - Date string
 * @param {Object} logger - Logger instance
 */
async function processDisassemblyBatch(serverUrl, token, database, connection, batch, bom, bomId, locationGroup, moNum, dateStr, logger) {
  const currentJob = getCurrentJob();

  logger.info(`DISASSEMBLY - Processing ${batch.length} item(s)`);

  try {
    // Update MO numbers in database
    const batchIds = batch.map(item => item.id).join(',');
    await connection.query(
      `UPDATE mo_queue SET mo_number = ? WHERE id IN (${batchIds})`,
      [moNum]
    );

    // Query part details for all unique part IDs from all batch items
    const allPartIds = new Set();
    batch.forEach(item => {
      if (item.original_wo_structure) {
        const woStructure = JSON.parse(item.original_wo_structure);
        woStructure.forEach(woItem => {
          allPartIds.add(woItem.partid);
        });
      }
    });

    // Get part details (num, description, uomid) for all parts
    const partIdsList = Array.from(allPartIds).join(',');
    const partSql = `
      SELECT
        part.id AS part_id,
        part.num AS part_num,
        part.description AS part_description,
        part.uomid AS uom_id
      FROM part
      WHERE part.id IN (${partIdsList})
    `;
    const partDetails = await fishbowlQuery(partSql, serverUrl, token);
    const partMap = new Map(partDetails.map(p => [p.part_id, p]));

    logger.info(`DISASSEMBLY - Loaded details for ${partDetails.length} unique parts`);

    // Create configurations for each disassembly using original WO structure
    const configurations = batch.map((item, idx) => {
      const barcode = item.barcode;

      if (!item.original_wo_structure) {
        throw new Error(`No original WO structure found for ${barcode}`);
      }

      const woStructure = JSON.parse(item.original_wo_structure);
      logger.info(`DISASSEMBLY - ${barcode}: ${woStructure.length} original items`);

      // Build items array with REVERSED types
      const items = [];
      let sortId = 1;

      woStructure.forEach(woItem => {
        const part = partMap.get(woItem.partid);
        if (!part) {
          throw new Error(`Part ${woItem.partid} not found in part details`);
        }

        // Reverse the types: "Finished Good" → "Raw Good", "Raw Good" → "Finished Good"
        const originalType = woItem.woitem_type;
        const reversedType = originalType === "Finished Good" ? "Raw Good" : "Finished Good";

        items.push({
          description: `${reversedType === "Raw Good" ? "Consume" : "Produce"} ${part.part_num}`,
          part: { id: woItem.partid },
          quantity: woItem.woitem_qty.toString(),
          type: reversedType,
          sortId: sortId++,
          uom: { id: part.uom_id }
        });
      });

      return {
        description: `Disassemble ${barcode}`,
        quantity: 1,
        sortId: idx + 1,
        dateScheduled: new Date().toISOString(),
        items: items
      };
    });

    // Create disassembly MO
    const moPayload = {
      locationGroup: { id: parseInt(locationGroup) },
      dateScheduled: new Date().toISOString(),
      number: moNum,
      configurations: configurations
    };

    logger.info(`DISASSEMBLY - Creating MO ${moNum}`);
    const moResult = await callFishbowlREST(serverUrl, token, 'manufacture-orders', 'POST', moPayload);

    if (!moResult || !moResult.id) {
      throw new Error('Failed to create disassembly MO: ' + JSON.stringify(moResult).substring(0, 200));
    }

    const moId = moResult.id;
    logger.info(`DISASSEMBLY - MO created: ${moNum} (ID: ${moId})`);

    // Issue MO
    await callFishbowlREST(serverUrl, token, `manufacture-orders/${moId}/issue`, 'POST');
    logger.info(`DISASSEMBLY - MO issued`);

    // Get WO numbers from Fishbowl API
    const woSql = `
      SELECT wo.num, wo.id FROM wo
      JOIN moitem ON moitem.id = wo.moitemid
      JOIN mo ON mo.id = moitem.moid
      WHERE mo.num = '${moNum.replace(/'/g, "''")}'
      ORDER BY wo.id
    `;
    const woRows = await fishbowlQuery(woSql, serverUrl, token);

    logger.info(`DISASSEMBLY - Found ${woRows.length} WOs to process`);

    // Process each WO for disassembly
    for (let i = 0; i < woRows.length && i < batch.length; i++) {
      const woNum = woRows[i].num;
      const queueItem = batch[i];
      const itemId = queueItem.id;
      const barcode = queueItem.barcode;
      const returnLocation = queueItem.fg_location;
      const originalWoStructure = queueItem.original_wo_structure ? JSON.parse(queueItem.original_wo_structure) : null;

      currentJob.currentWO = woNum;

      logger.info(`DISASSEMBLY - Processing WO ${woNum} | Barcode ${barcode} | Return Location ${returnLocation || 'None'}`);

      try {
        // Process the disassembly work order
        await processDisassemblyWorkOrder(serverUrl, token, woNum, barcode, originalWoStructure, returnLocation, partMap, logger);

        // Mark as success
        await connection.query(
          `UPDATE mo_queue SET status = 'Success', wo_number = ?, error_message = NULL WHERE id = ?`,
          [woNum, itemId]
        );

        currentJob.successItems++;
        currentJob.results.push({
          woNum, barcode, status: 'success'
        });

        logger.info(`DISASSEMBLY - Success: ${woNum} | ${barcode}`);

      } catch (error) {
        logger.error(`DISASSEMBLY - Failed: ${woNum} | ${barcode}`, { error: error.message });

        // Mark as failed
        await connection.query(
          `UPDATE mo_queue SET status = 'Failed', wo_number = ?, error_message = ? WHERE id = ?`,
          [woNum, error.message, itemId]
        );

        currentJob.failedItems++;
        currentJob.results.push({
          woNum, barcode, status: 'failed', error: error.message
        });
      }

      currentJob.processedItems++;

      // Check if stop was requested
      if (currentJob.stopRequested) {
        logger.info('DISASSEMBLY - Stop requested, pausing job after completing current WO');
        logger.info(`DISASSEMBLY - Last completed WO: ${woNum}`);
        currentJob.status = 'stopped';
        currentJob.stopRequested = false;
        return;
      }
    }

    logger.info(`DISASSEMBLY - Completed ${batch.length} item(s)`);

  } catch (error) {
    logger.error(`DISASSEMBLY - Error processing batch`, { error: error.message });

    // Mark all items as failed
    for (const item of batch) {
      await connection.query(
        `UPDATE mo_queue SET status = 'Failed', error_message = ? WHERE id = ?`,
        [error.message.substring(0, 500), item.id]
      );
      currentJob.failedItems++;
      currentJob.processedItems++;
    }

    currentJob.results.push({
      moNum: moNum,
      status: 'failed',
      error: error.message
    });
  }
}

/**
 * Process a disassembly work order
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} woNum - Work order number
 * @param {string} barcode - Finished good barcode being disassembled
 * @param {Array} originalWoStructure - Original WO structure from build
 * @param {string} returnLocation - Return location for raw goods
 * @param {Map} partMap - Map of part IDs to part details
 * @param {Object} logger - Logger instance
 */
async function processDisassemblyWorkOrder(serverUrl, token, woNum, barcode, originalWoStructure, returnLocation, partMap, logger) {
  const { callFishbowlLegacy } = require('./fishbowlApi');
  const dateScheduled = new Date().toISOString().slice(0, 19);

  // STEP 1: Get Pick
  const getPickPayload = { GetPickRq: { WoNum: woNum } };
  const pickResult = await callFishbowlLegacy(serverUrl, token, 'GetPickRq', getPickPayload);

  if (pickResult.FbiJson?.FbiMsgsRs?.GetPickRs?.statusCode !== 1000) {
    throw new Error('Failed to get pick for disassembly');
  }

  const pick = pickResult.FbiJson.FbiMsgsRs.GetPickRs.Pick;

  // STEP 2: Open Pick
  pick.DateScheduled = pick.DateStarted = dateScheduled;
  const savePickResult1 = await callFishbowlLegacy(serverUrl, token, 'SavePickRq', { SavePickRq: { Pick: pick } });

  if (savePickResult1.FbiJson?.FbiMsgsRs?.SavePickRs?.statusCode !== 1000) {
    throw new Error('Failed to open pick for disassembly');
  }

  const savedPick = savePickResult1.FbiJson.FbiMsgsRs.SavePickRs.Pick;

  // STEP 3: For disassembly, we need to pick the FG (which is being consumed)
  // The pick items should have the FG with tracking (barcode)
  const originalPickItem = savedPick.PickItems.PickItem;
  const pickItemArray = Array.isArray(originalPickItem) ? originalPickItem : [originalPickItem];

  // Find the FG part ID from original WO structure (what was produced in the build)
  const originalFgItem = originalWoStructure.find(item => item.woitem_type === "Finished Good");
  if (!originalFgItem) {
    throw new Error('No Finished Good found in original WO structure');
  }

  // Find the FG pick item (the one being consumed)
  const fgPickItem = pickItemArray.find(item => item.Part?.PartID === originalFgItem.partid);

  if (fgPickItem) {
    // Set status to finished (40)
    fgPickItem.Status = 40;
    fgPickItem.Quantity = "1";

    // Add barcode tracking
    const partTracking = fgPickItem.Part?.PartTrackingList?.PartTracking;
    const trackingArray = Array.isArray(partTracking) ? partTracking : [partTracking];
    const barcodeTrackingInfo = trackingArray.find(pt => pt.Name === "Barcode" || pt.PartTrackingID === 5);

    if (barcodeTrackingInfo) {
      fgPickItem.Tracking = {
        TrackingItem: [{
          PartTracking: barcodeTrackingInfo,
          SerialBoxList: {
            SerialBox: [{
              Committed: false,
              SerialID: -1,
              TagID: -1,
              SerialNumList: {
                SerialNum: [{
                  Number: barcode,
                  PartTracking: barcodeTrackingInfo,
                  SerialID: -1,
                  SerialNumID: -1
                }]
              }
            }]
          },
          TrackingValue: ""
        }]
      };
    }
  }

  // Save the pick with tracking
  const savePickResult2 = await callFishbowlLegacy(serverUrl, token, 'SavePickRq', { SavePickRq: { Pick: savedPick } });

  if (savePickResult2.FbiJson?.FbiMsgsRs?.SavePickRs?.statusCode !== 1000) {
    throw new Error('Failed to finish pick for disassembly');
  }

  // STEP 4: Get WO and complete it
  const getWOPayload = { GetWorkOrderRq: { WorkOrderNumber: woNum } };
  const getWOResult = await callFishbowlLegacy(serverUrl, token, 'GetWorkOrderRq', getWOPayload);

  if (getWOResult.FbiJson?.FbiMsgsRs?.ErrorRs) {
    throw new Error('Failed to get work order for disassembly');
  }

  const wo = getWOResult.FbiJson.FbiMsgsRs.GetWorkOrderRs.WO;

  logger.info(`DISASSEMBLY - WO retrieved, processing items for ${woNum}`);

  // Query location details for raw goods return location
  let destLocationInfo = null;
  if (returnLocation) {
    // returnLocation can be either a location ID or "LocationGroup-Location" format
    // Check if it's a number (location ID) or contains a dash (LocationGroup-Location)
    let locationQuerySql;
    if (returnLocation.includes('-')) {
      // Format: LocationGroup-Location
      const [locGroupName, locName] = returnLocation.split('-');
      locationQuerySql = `
        SELECT
          location.id as location_id,
          location.typeid as location_typeid,
          location.name as location_name,
          location.description as location_description,
          location.countedAsAvailable,
          location.activeflag,
          location.pickable,
          location.receivable,
          location.sortorder,
          locationgroup.id as locationgroup_id,
          locationgroup.name as locationgroup_name,
          tag.id as tag_id,
          tag.num as tag_num
        FROM location
        JOIN locationgroup ON locationgroup.id = location.locationgroupid
        LEFT JOIN tag ON tag.locationid = location.id
        WHERE locationgroup.name = '${locGroupName.replace(/'/g, "''")}'
          AND location.name = '${locName.replace(/'/g, "''")}'
      `;
    } else {
      // Format: Location ID
      const locationId = parseInt(returnLocation);
      locationQuerySql = `
        SELECT
          location.id as location_id,
          location.typeid as location_typeid,
          location.name as location_name,
          location.description as location_description,
          location.countedAsAvailable,
          location.activeflag,
          location.pickable,
          location.receivable,
          location.sortorder,
          locationgroup.id as locationgroup_id,
          locationgroup.name as locationgroup_name,
          tag.id as tag_id,
          tag.num as tag_num
        FROM location
        JOIN locationgroup ON locationgroup.id = location.locationgroupid
        LEFT JOIN tag ON tag.locationid = location.id
        WHERE location.id = ${locationId}
      `;
    }

    const locRows = await fishbowlQuery(locationQuerySql, serverUrl, token);

    if (locRows.length > 0) {
      const loc = locRows[0];
      destLocationInfo = {
        LocationID: loc.location_id,
        TypeID: loc.location_typeid || 10,
        Name: loc.location_name,
        Description: loc.location_description || '',
        CountedAsAvailable: loc.countedAsAvailable !== false,
        Active: loc.activeflag !== false,
        Pickable: loc.pickable !== false,
        Receivable: loc.receivable !== false,
        LocationGroupID: loc.locationgroup_id,
        LocationGroupName: loc.locationgroup_name,
        TagID: loc.tag_id || -1,
        TagNumber: loc.tag_num || '-1',
        ParentID: 0,
        SortOrder: loc.sortorder || 0
      };
      logger.info(`DISASSEMBLY - Return location: ${loc.locationgroup_name}-${loc.location_name} (ID: ${loc.location_id})`);
    } else {
      logger.warn(`DISASSEMBLY - Return location not found: ${returnLocation}`);
    }
  }

  // STEP 5: Complete WO with tracking for produced raw goods
  wo.DateScheduled = wo.DateScheduledToStart = dateScheduled;
  wo.StatusID = 40;

  if (wo.WOItems && wo.WOItems.WOItem) {
    const woItems = Array.isArray(wo.WOItems.WOItem) ? wo.WOItems.WOItem : [wo.WOItems.WOItem];

    logger.info(`DISASSEMBLY - WO has ${woItems.length} items total`);

    // For disassembly, the "Finished Goods" in the WO are actually the raw materials being produced
    // We need to apply tracking from the original WO (what was consumed in the build)
    const fgItems = woItems.filter(item => item.TypeID === 10);

    logger.info(`DISASSEMBLY - Found ${fgItems.length} FG items (produced raw goods)`);

    fgItems.forEach((woItem, idx) => {
      const partId = woItem.Part?.PartID;
      const partNum = woItem.Part?.PartNum || 'Unknown';

      // Find corresponding item from original WO structure
      // In the original build, this part was a "Raw Good" that was consumed
      const originalItem = originalWoStructure.find(item => item.partid === partId && item.woitem_type === "Raw Good");

      if (!originalItem) {
        logger.warn(`DISASSEMBLY - No matching original WO item found for part ${partNum}, skipping tracking`);
        return;
      }

      // Use the ORIGINAL quantity from the build WO, not what Fishbowl set in the new WO
      woItem.QtyUsed = originalItem.woitem_qty.toString();

      logger.info(`DISASSEMBLY - Processing FG item ${idx + 1}: ${partNum} (ID: ${partId}), Qty: ${woItem.QtyUsed}`);

      // Get serial numbers from original WO structure
      const serialsStr = originalItem.serial_numbers;
      if (serialsStr) {
        const serials = serialsStr.split(',').filter(s => s.trim());
        logger.info(`DISASSEMBLY - Found ${serials.length} serial(s) from original WO for ${partNum}: ${serials.join(', ')}`);

        // Find serial tracking info for this part
        const partTrackingList = woItem.Part?.PartTrackingList?.PartTracking;
        if (partTrackingList) {
          const trackingArray = Array.isArray(partTrackingList) ? partTrackingList : [partTrackingList];
          const serialTrackingInfo = trackingArray.find(pt => pt.PartTrackingID === 4 || pt.Name.toLowerCase().includes('serial'));

          if (serialTrackingInfo && serials.length > 0) {
            woItem.Tracking = {
              TrackingItem: [{
                PartTracking: serialTrackingInfo,
                SerialBoxList: {
                  SerialBox: serials.map(serial => ({
                    Committed: false,
                    SerialID: -1,
                    TagID: -1,
                    SerialNumList: {
                      SerialNum: [{
                        Number: serial,
                        PartTracking: serialTrackingInfo,
                        SerialID: -1,
                        SerialNumID: -1
                      }]
                    }
                  }))
                },
                TrackingValue: ""
              }]
            };
            logger.info(`DISASSEMBLY - Applied ${serials.length} serial(s) to ${partNum}`);
          }
        }
      } else {
        logger.info(`DISASSEMBLY - No serial tracking in original WO for ${partNum}`);
      }

      // Set destination location for produced raw goods
      if (destLocationInfo) {
        woItem.DestLocation = { Location: destLocationInfo };
        logger.info(`DISASSEMBLY - Set destination location for ${partNum}: ${destLocationInfo.LocationGroupName}-${destLocationInfo.Name}`);
      }
    });
  }

  logger.info(`DISASSEMBLY - Saving WO ${woNum}...`);

  const saveWOResult = await callFishbowlLegacy(serverUrl, token, 'SaveWorkOrderRq', { SaveWorkOrderRq: { WO: wo } });

  if (saveWOResult.FbiJson?.FbiMsgsRs?.SaveWorkOrderRs?.statusCode !== 1000) {
    // Log the actual error from Fishbowl
    const errorMsg = saveWOResult.FbiJson?.FbiMsgsRs?.SaveWorkOrderRs?.statusMessage ||
                     saveWOResult.FbiJson?.FbiMsgsRs?.ErrorRs?.Message ||
                     'Unknown error';
    logger.error(`DISASSEMBLY - Fishbowl error saving WO: ${errorMsg}`);
    logger.error(`DISASSEMBLY - Full response: ${JSON.stringify(saveWOResult).substring(0, 1000)}`);
    throw new Error(`Failed to complete WO for disassembly: ${errorMsg}`);
  }

  logger.info(`DISASSEMBLY - WO ${woNum} completed successfully`);
}

/**
 * Process queue in background
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} database - Database name
 * @param {string} bom - BOM number
 * @param {number} bomId - BOM ID
 * @param {string} locationGroup - Location group ID
 * @param {Object} logger - Logger instance
 */
async function processQueueBackground(serverUrl, token, database, bom, bomId, locationGroup, logger) {
  logger.info('BACKGROUND PROCESSOR - Starting');

  let connection;

  try {
    // Connect to MySQL
    connection = await createConnection(database);

    logger.info('BACKGROUND PROCESSOR - Connected to database');

    // Get pending items
    const pendingItems = await getPendingItems(connection);

    if (pendingItems.length === 0) {
      logger.info('BACKGROUND PROCESSOR - No pending items');
      const currentJob = getCurrentJob();
      currentJob.status = 'completed';
      currentJob.endTime = new Date().toISOString();
      return;
    }

    logger.info(`BACKGROUND PROCESSOR - Found ${pendingItems.length} pending items`);

    const currentJob = getCurrentJob();
    currentJob.totalItems = pendingItems.length;

    // Check for existing MO numbers - GET ALL matching MOs to find max sequence numerically
    const today = new Date();
    const dateStr = today.getFullYear().toString().slice(2) +
                   String(today.getMonth() + 1).padStart(2, '0') +
                   String(today.getDate()).padStart(2, '0');

    const moPattern = `${bom}|${dateStr}|%`;

    // Get ALL matching MOs from Fishbowl API
    const moSql = `SELECT num FROM mo WHERE num LIKE '${moPattern.replace(/'/g, "''")}'`;
    const existingMOs = await fishbowlQuery(moSql, serverUrl, token);

    let startingSequence = 1;

    if (existingMOs.length > 0) {
      logger.info(`BACKGROUND PROCESSOR - Found ${existingMOs.length} existing MO(s) for today`);

      // Parse all sequence numbers and find the maximum numerically
      const sequences = existingMOs
        .map(row => {
          const parts = row.num.split('|');
          if (parts.length === 3) {
            const seq = parseInt(parts[2], 10);
            return isNaN(seq) ? 0 : seq;
          }
          return 0;
        })
        .filter(seq => seq > 0);

      if (sequences.length > 0) {
        const maxSequence = Math.max(...sequences);
        startingSequence = maxSequence + 1;
        logger.info(`BACKGROUND PROCESSOR - Last MO sequence: ${maxSequence}, starting from ${startingSequence}`);
      }
    } else {
      logger.info('BACKGROUND PROCESSOR - No existing MOs for today, starting from 1');
    }

    logger.info(`BACKGROUND PROCESSOR - Starting from sequence ${startingSequence}`);

    // Group into batches of 100
    const batches = [];
    for (let i = 0; i < pendingItems.length; i += 100) {
      batches.push(pendingItems.slice(i, i + 100));
    }

    currentJob.totalBatches = batches.length;
    logger.info(`BACKGROUND PROCESSOR - ${batches.length} batches to process`);

    // Process each batch
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const moNum = `${bom}|${dateStr}|${startingSequence + batchIdx}`;

      currentJob.currentBatch = batchIdx + 1;
      currentJob.currentMO = moNum;

      logger.info(`BACKGROUND PROCESSOR - Batch ${batchIdx + 1}/${batches.length}: MO ${moNum}`);

      // Check if this is a disassembly batch
      const isDisassembly = batch[0].operation_type === 'disassemble';

      if (isDisassembly) {
        logger.info(`BACKGROUND PROCESSOR - DISASSEMBLY mode detected`);
        // Handle disassembly separately
        await processDisassemblyBatch(serverUrl, token, database, connection, batch, bom, bomId, locationGroup, moNum, dateStr, logger);
        continue; // Skip normal BUILD processing
      }

      try {
        // Update MO numbers in database
        const batchIds = batch.map(item => item.id).join(',');
        await connection.query(
          `UPDATE mo_queue SET mo_number = ? WHERE id IN (${batchIds})`,
          [moNum]
        );

        // Create MO
        const configurations = batch.map((item, idx) => ({
          bom: { id: parseInt(bomId) },
          quantity: 1,
          sortId: idx + 1,
          dateScheduled: new Date().toISOString()
        }));

        const moPayload = {
          locationGroup: { id: parseInt(locationGroup) },
          dateScheduled: new Date().toISOString(),
          number: moNum,
          configurations: configurations
        };

        const moResult = await callFishbowlREST(serverUrl, token, 'manufacture-orders', 'POST', moPayload);

        if (!moResult || !moResult.id) {
          throw new Error('Failed to create MO: ' + JSON.stringify(moResult).substring(0, 200));
        }

        const moId = moResult.id;
        logger.info(`BACKGROUND PROCESSOR - MO created: ${moNum} (ID: ${moId})`);

        // Issue MO
        await callFishbowlREST(serverUrl, token, `manufacture-orders/${moId}/issue`, 'POST');
        logger.info(`BACKGROUND PROCESSOR - MO issued`);

        // Get WO numbers from Fishbowl API
        const woSql = `
          SELECT wo.num, wo.id FROM wo
          JOIN moitem ON moitem.id = wo.moitemid
          JOIN mo ON mo.id = moitem.moid
          WHERE mo.num = '${moNum.replace(/'/g, "''")}'
          ORDER BY wo.id
        `;
        const woRows = await fishbowlQuery(woSql, serverUrl, token);

        logger.info(`BACKGROUND PROCESSOR - Found ${woRows.length} WOs`);

        // Process each WO
        for (let i = 0; i < woRows.length && i < batch.length; i++) {
          const woNum = woRows[i].num;
          const queueItem = batch[i];
          const itemId = queueItem.id;
          const barcode = queueItem.barcode;
          const serialsJson = queueItem.serial_numbers;
          const serials = JSON.parse(serialsJson);
          const fgLocation = queueItem.fg_location;
          const rawGoodsPartId = queueItem.raw_goods_part_id;

          currentJob.currentWO = woNum;

          logger.info(`BACKGROUND PROCESSOR - Processing WO ${woNum} | Barcode ${barcode}`);

          try {
            // Process the work order
            await processWorkOrder(serverUrl, token, database, connection, woNum, barcode, serials, fgLocation, bom, rawGoodsPartId, logger);

            // Mark as success
            await connection.query(
              `UPDATE mo_queue SET status = 'Success', wo_number = ?, error_message = NULL WHERE id = ?`,
              [woNum, itemId]
            );

            currentJob.successItems++;
            currentJob.results.push({
              woNum, barcode, serials: serials.length, status: 'success'
            });

            logger.info(`BACKGROUND PROCESSOR - Success: ${woNum} | ${barcode}`);

          } catch (error) {
            logger.error(`BACKGROUND PROCESSOR - Failed: ${woNum} | ${barcode}`, { error: error.message });

            // Check retry count
            const retryCount = queueItem.retry_count || 0;

            if (retryCount < 1) {
              // Retry once
              logger.info(`BACKGROUND PROCESSOR - Retrying ${woNum}`);

              try {
                await processWorkOrder(serverUrl, token, database, connection, woNum, barcode, serials, fgLocation, bom, rawGoodsPartId, logger);

                await connection.query(
                  `UPDATE mo_queue SET status = 'Success', wo_number = ?, error_message = NULL, retry_count = ? WHERE id = ?`,
                  [woNum, retryCount + 1, itemId]
                );

                currentJob.successItems++;
                currentJob.results.push({
                  woNum, barcode, serials: serials.length, status: 'success-retry'
                });

                logger.info(`BACKGROUND PROCESSOR - Success on retry: ${woNum}`);

              } catch (retryError) {
                await connection.query(
                  `UPDATE mo_queue SET status = 'Failed', wo_number = ?, error_message = ?, retry_count = ? WHERE id = ?`,
                  [woNum, retryError.message, retryCount + 1, itemId]
                );

                currentJob.failedItems++;
                currentJob.results.push({
                  woNum, barcode, serials: serials.length, status: 'failed', error: retryError.message
                });

                logger.error(`BACKGROUND PROCESSOR - Failed on retry: ${woNum}`);
              }
            } else {
              // Already retried
              await connection.query(
                `UPDATE mo_queue SET status = 'Failed', wo_number = ?, error_message = ? WHERE id = ?`,
                [woNum, error.message, itemId]
              );

              currentJob.failedItems++;
              currentJob.results.push({
                woNum, barcode, serials: serials.length, status: 'failed', error: error.message
              });
            }
          }

          currentJob.processedItems++;

          // Check if stop was requested AFTER completing the current work order
          // This ensures the WO is fully processed (picked, finished, DB updated) before stopping
          if (currentJob.stopRequested) {
            logger.info('BACKGROUND PROCESSOR - Stop requested, pausing job after completing current WO');
            logger.info(`BACKGROUND PROCESSOR - Last completed WO: ${woNum}`);
            currentJob.status = 'stopped';
            currentJob.stopRequested = false;
            return;
          }
        }

      } catch (moError) {
        logger.error(`BACKGROUND PROCESSOR - MO creation error: ${moError.message}`);

        // Mark all items in batch as failed
        for (const item of batch) {
          await connection.query(
            `UPDATE mo_queue SET status = 'Failed', mo_number = ?, error_message = ? WHERE id = ?`,
            [moNum, 'MO creation failed: ' + moError.message, item.id]
          );

          currentJob.failedItems++;
          currentJob.processedItems++;
        }
      }
    }

    // Processing complete
    currentJob.status = 'completed';
    currentJob.endTime = new Date().toISOString();

    logger.info('BACKGROUND PROCESSOR - Complete', {
      total: currentJob.totalItems,
      success: currentJob.successItems,
      failed: currentJob.failedItems
    });

  } catch (error) {
    logger.error('BACKGROUND PROCESSOR - Fatal error', { error: error.message, stack: error.stack });
    const currentJob = getCurrentJob();
    currentJob.status = 'error';
    currentJob.error = error.message;
    currentJob.endTime = new Date().toISOString();
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Close short pending jobs
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} database - Database name
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Result with counts
 */
async function closeShortPendingJobs(serverUrl, token, database, logger) {
  let connection;

  try {
    connection = await createConnection(database);

    // Get all pending items with MO numbers (MOs that were created but not finished)
    const [pendingItems] = await connection.query(
      "SELECT DISTINCT mo_number FROM mo_queue WHERE status = 'Pending' AND mo_number IS NOT NULL"
    );

    if (pendingItems.length === 0) {
      logger.info('CLOSE SHORT - No MOs to close short');

      // Mark all pending items without MO numbers as closed_short
      await connection.query(
        "UPDATE mo_queue SET status = 'closed_short' WHERE status = 'Pending'"
      );

      return {
        closedShortCount: 0,
        markedCount: 0,
        failedMOs: []
      };
    }

    logger.info(`CLOSE SHORT - Found ${pendingItems.length} MO(s) to close short`);

    let closedCount = 0;
    const failedMOs = [];

    // Close short each MO
    for (const item of pendingItems) {
      const moNum = item.mo_number;

      try {
        logger.info(`CLOSE SHORT - Processing MO: ${moNum}`);

        // Get MO ID from Fishbowl API
        const moSql = `SELECT id FROM mo WHERE num = '${moNum.replace(/'/g, "''")}'`;
        const moRows = await fishbowlQuery(moSql, serverUrl, token);

        if (!moRows || moRows.length === 0) {
          logger.warn(`CLOSE SHORT - MO ${moNum} not found in Fishbowl (may not have been created)`);
          continue;
        }

        const moId = moRows[0].id;
        logger.info(`CLOSE SHORT - MO ${moNum} has ID ${moId}`);

        // Call close-short API
        const { fetchWithNode } = require('../utils/helpers');
        const closeShortResponse = await fetchWithNode(`${serverUrl}/api/manufacture-orders/${moId}/close-short`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (closeShortResponse.ok) {
          logger.info(`CLOSE SHORT - Successfully closed short MO ${moNum}`);
          closedCount++;
        } else {
          const errorText = await closeShortResponse.text();
          logger.error(`CLOSE SHORT - Failed to close short MO ${moNum}`, { error: errorText });
          failedMOs.push({ moNum, error: errorText });
        }

      } catch (error) {
        logger.error(`CLOSE SHORT - Error processing MO ${moNum}`, { error: error.message });
        failedMOs.push({ moNum, error: error.message });
      }
    }

    // Mark all pending items as closed_short
    const [updateResult] = await connection.query(
      "UPDATE mo_queue SET status = 'closed_short' WHERE status = 'Pending'"
    );

    logger.info(`CLOSE SHORT - Marked ${updateResult.affectedRows} queue item(s) as closed_short`);

    return {
      closedShortCount: closedCount,
      markedCount: updateResult.affectedRows,
      failedMOs: failedMOs
    };

  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = {
  processQueueBackground,
  closeShortPendingJobs
};