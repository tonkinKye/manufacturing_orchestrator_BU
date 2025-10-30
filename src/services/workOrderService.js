const { fishbowlQuery, callFishbowlLegacy } = require('./fishbowlApi');

/**
 * Work Order Service
 * Handles work order processing logic
 */

/**
 * Process a work order
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @param {string} database - Database name
 * @param {Connection} connection - MySQL connection
 * @param {string} woNum - Work order number
 * @param {string} barcode - Finished good barcode
 * @param {Array} serials - Serial numbers
 * @param {string} fgLocation - Finished goods location
 * @param {string} bom - BOM number
 * @param {number} rawGoodsPartId - Raw goods part ID
 * @param {Object} logger - Logger instance
 */
async function processWorkOrder(serverUrl, token, database, connection, woNum, barcode, serials, fgLocation, bom, rawGoodsPartId, logger) {
  const dateScheduled = new Date().toISOString().slice(0, 19);

  // Check if WO is already completed (from previous run before job was stopped)
  const getWOCheckPayload = { GetWorkOrderRq: { WorkOrderNumber: woNum } };
  const getWOCheckResult = await callFishbowlLegacy(serverUrl, token, 'GetWorkOrderRq', getWOCheckPayload);

  if (!getWOCheckResult.FbiJson?.FbiMsgsRs?.ErrorRs) {
    const woCheck = getWOCheckResult.FbiJson.FbiMsgsRs.GetWorkOrderRs.WO;
    if (woCheck.StatusID >= 50) {
      logger.info(`WO ${woNum} - Already completed (Status: ${woCheck.StatusID}), skipping processing`);
      return; // WO already complete, nothing to do
    }
  }

  // STEP 1: GetPickRq via legacy API
  const getPickPayload = { GetPickRq: { WoNum: woNum } };
  const pickResult = await callFishbowlLegacy(serverUrl, token, 'GetPickRq', getPickPayload);

  if (pickResult.FbiJson?.FbiMsgsRs?.GetPickRs?.statusCode !== 1000) {
    throw new Error('Failed to get pick');
  }

  const pick = pickResult.FbiJson.FbiMsgsRs.GetPickRs.Pick;

  // STEP 2: Open Pick (if not already open)
  // Status: 10 = Not Started, 40 = In Progress, 50 = Complete
  let savedPick;

  if (pick.Status >= 40) {
    // Pick is already open or completed (from previous run before job was stopped)
    logger.info(`WO ${woNum} - Pick already open/completed (Status: ${pick.Status}), skipping open step`);
    savedPick = pick;
  } else {
    // Pick needs to be opened
    pick.DateScheduled = pick.DateStarted = dateScheduled;
    const savePickResult1 = await callFishbowlLegacy(serverUrl, token, 'SavePickRq', { SavePickRq: { Pick: pick } });

    if (savePickResult1.FbiJson?.FbiMsgsRs?.SavePickRs?.statusCode !== 1000) {
      throw new Error('Failed to open pick');
    }

    savedPick = savePickResult1.FbiJson.FbiMsgsRs.SavePickRs.Pick;
    logger.info(`WO ${woNum} - Pick opened successfully`);
  }

  // STEP 3: Query serial locations from Fishbowl API - FILTERED BY SELECTED RAW GOODS PART
  const serialsInClause = serials.map(s => `'${s.replace(/'/g, "''")}'`).join(',');

  const locationSql = `
    SELECT
      serialnum.SerialNum as serial,
      location.id as location_id,
      location.name as location_name,
      locationgroup.id as locationgroup_id,
      locationgroup.name as locationgroup_name,
      location.typeid as location_typeid,
      location.description as location_description,
      location.pickable as location_pickable,
      location.receivable as location_receivable,
      location.activeflag as location_active,
      location.countedAsAvailable as location_counted_as_available,
      tag.id as tag_id,
      tag.num as tag_num
    FROM bom
    JOIN bomitem ON bomitem.bomid = bom.id AND bomitem.typeid = 20
    JOIN part ON part.id = bomitem.partid
    JOIN tag ON tag.partid = part.id
    JOIN serial ON serial.tagid = tag.id
    JOIN serialnum ON serialnum.serialid = serial.id AND serialnum.parttrackingid = 4
    JOIN location ON location.id = tag.locationid
    JOIN locationgroup ON locationgroup.id = location.locationgroupid
    WHERE bom.num = '${bom.replace(/'/g, "''")}'
      AND part.id = ${rawGoodsPartId}
      AND serialnum.SerialNum IN (${serialsInClause})
    ORDER BY location.id, serialnum.SerialNum
  `;

  const locationRows = await fishbowlQuery(locationSql, serverUrl, token);

  if (locationRows.length === 0) {
    throw new Error('No serial locations found');
  }

  // Build location map
  const serialLocationMap = new Map();
  const locationGroups = new Map();

  locationRows.forEach(row => {
    const serial = row.serial;
    const locId = row.location_id;
    const locInfo = {
      locationId: locId,
      locationName: row.location_name,
      locationGroupId: row.locationgroup_id,
      locationGroupName: row.locationgroup_name,
      locationTypeId: row.location_typeid,
      locationDescription: row.location_description,
      tagId: row.tag_id,
      tagNum: row.tag_num,
      pickable: row.location_pickable,
      receivable: row.location_receivable,
      active: row.location_active,
      countedAsAvailable: row.location_counted_as_available
    };

    serialLocationMap.set(serial, locInfo);

    if (!locationGroups.has(locId)) {
      locationGroups.set(locId, { locationInfo: locInfo, serials: [] });
    }
    locationGroups.get(locId).serials.push(serial);
  });

  // STEP 4: Split pick by location (only if not already processed)
  // If pick status is already 40+ and pick items have tracking, pick was already split in previous run
  const originalPickItem = savedPick.PickItems.PickItem;
  const pickItemArray = Array.isArray(originalPickItem) ? originalPickItem : [originalPickItem];
  const firstItem = pickItemArray[0];

  // Check if pick is already split and finished (has tracking with serials)
  const alreadyProcessed = pick.Status >= 40 && firstItem.Tracking?.TrackingItem;

  if (alreadyProcessed) {
    logger.info(`WO ${woNum} - Pick already split and processed in previous run, skipping split step`);
  } else {
    logger.info(`WO ${woNum} - Splitting pick by location`);

    const partTracking = firstItem.Part.PartTrackingList.PartTracking;
    const trackingArray = Array.isArray(partTracking) ? partTracking : [partTracking];
    const serialTracking = trackingArray.find(t => t.PartTrackingID === 4 || t.Name.toLowerCase().includes('serial'));

    if (!serialTracking) {
      throw new Error('Could not find serial tracking');
    }

    const newPickItems = [];
    let isFirst = true;

    for (const [locId, group] of locationGroups) {
      const locInfo = group.locationInfo;
      const pickItem = JSON.parse(JSON.stringify(firstItem));

      pickItem.PickItemID = isFirst ? firstItem.PickItemID : 0;
      isFirst = false;

      pickItem.Quantity = group.serials.length.toString();
      pickItem.Status = 40;

      pickItem.Location = {
        LocationID: locInfo.locationId,
        TypeID: locInfo.locationTypeId || 20,
        Name: locInfo.locationName,
        Description: locInfo.locationDescription || '',
        CountedAsAvailable: locInfo.countedAsAvailable !== false,
        Active: locInfo.active !== false,
        Pickable: locInfo.pickable !== false,
        Receivable: locInfo.receivable !== false,
        LocationGroupID: locInfo.locationGroupId,
        LocationGroupName: locInfo.locationGroupName,
        TagID: locInfo.tagId || -1,
        TagNumber: locInfo.tagNum || '-1',
        ParentID: 0,
        SortOrder: 0
      };

      pickItem.Tracking = {
        TrackingItem: [{
          PartTracking: serialTracking,
          SerialBoxList: {
            SerialBox: group.serials.map(serial => ({
              Committed: false, SerialID: -1, TagID: -1,
              SerialNumList: { SerialNum: [{ Number: serial, PartTracking: serialTracking, SerialID: -1, SerialNumID: -1 }] }
            }))
          },
          TrackingValue: ""
        }]
      };

      if (pickItem.Part?.PartTrackingList?.PartTracking && !Array.isArray(pickItem.Part.PartTrackingList.PartTracking)) {
        pickItem.Part.PartTrackingList.PartTracking = [pickItem.Part.PartTrackingList.PartTracking];
      }

      newPickItems.push(pickItem);
    }

    savedPick.PickItems.PickItem = newPickItems;

    const savePickResult2 = await callFishbowlLegacy(serverUrl, token, 'SavePickRq', { SavePickRq: { Pick: savedPick } });

    if (savePickResult2.FbiJson?.FbiMsgsRs?.SavePickRs?.statusCode !== 1000) {
      throw new Error('Failed to finish pick');
    }

    logger.info(`WO ${woNum} - Pick split and saved successfully`);
  }

  // STEP 5: Get WO and complete it
  const getWOPayload = { GetWorkOrderRq: { WorkOrderNumber: woNum } };
  const getWOResult = await callFishbowlLegacy(serverUrl, token, 'GetWorkOrderRq', getWOPayload);

  if (getWOResult.FbiJson?.FbiMsgsRs?.ErrorRs) {
    throw new Error('Failed to get work order');
  }

  const wo = getWOResult.FbiJson.FbiMsgsRs.GetWorkOrderRs.WO;

  // STEP 6: Complete WO with barcode
  wo.DateScheduled = wo.DateScheduledToStart = dateScheduled;
  wo.StatusID = 40;

  if (wo.WOItems && wo.WOItems.WOItem) {
    const woItems = Array.isArray(wo.WOItems.WOItem) ? wo.WOItems.WOItem : [wo.WOItems.WOItem];
    const fgItem = woItems.find(item => item.TypeID === 10);

    if (fgItem) {
      fgItem.QtyUsed = "1";

      const partTrackingList = fgItem.Part?.PartTrackingList?.PartTracking;
      const partTrackingArray = Array.isArray(partTrackingList) ? partTrackingList : [partTrackingList];
      const barcodeTrackingInfo = partTrackingArray.find(pt => pt.Name === "Barcode");

      if (barcodeTrackingInfo) {
        fgItem.Tracking = {
          TrackingItem: [{
            PartTracking: barcodeTrackingInfo,
            SerialBoxList: {
              SerialBox: [{
                Committed: false, SerialID: -1, TagID: -1,
                SerialNumList: { SerialNum: [{ Number: barcode, PartTracking: barcodeTrackingInfo, SerialID: -1, SerialNumID: -1 }] }
              }]
            },
            TrackingValue: ""
          }]
        };
      }

      // Set FG Location
      const [locGroupName, locName] = fgLocation.split('-');
      const locationQuerySql = `
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
      const locRows = await fishbowlQuery(locationQuerySql, serverUrl, token);

      if (locRows.length > 0) {
        const loc = locRows[0];
        fgItem.DestLocation = {
          Location: {
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
          }
        };
      }
    }
  }

  const saveWOResult = await callFishbowlLegacy(serverUrl, token, 'SaveWorkOrderRq', { SaveWorkOrderRq: { WO: wo } });

  if (saveWOResult.FbiJson?.FbiMsgsRs?.SaveWorkOrderRs?.statusCode !== 1000) {
    throw new Error('Failed to complete WO');
  }
}

module.exports = {
  processWorkOrder
};
