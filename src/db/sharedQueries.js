/**
 * Shared Database Query Functions
 *
 * Common SQL queries used across multiple services
 * Reduces code duplication and ensures consistency
 */

const { fishbowlQuery } = require('../services/fishbowlApi');
const { escapeSqlString, escapeSqlNumber } = require('../utils/sqlHelpers');

/**
 * Get location details by LocationGroup-Location format
 * @param {string} locationString - Format: "LocationGroup-Location" or numeric ID
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @returns {Promise<Object|null>} Location details or null if not found
 */
async function getLocationByName(locationString, serverUrl, token) {
  let locationQuerySql;

  if (locationString.includes('-')) {
    // Format: LocationGroup-Location
    const [locGroupName, locName] = locationString.split('-');
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
      WHERE locationgroup.name = '${escapeSqlString(locGroupName)}'
        AND location.name = '${escapeSqlString(locName)}'
    `;
  } else {
    // Format: Location ID
    const locationId = parseInt(locationString);
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
      WHERE location.id = ${escapeSqlNumber(locationId, 'locationId')}
    `;
  }

  const rows = await fishbowlQuery(locationQuerySql, serverUrl, token);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get work order numbers for a manufacturing order
 * @param {string} moNumber - MO number
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @returns {Promise<Array>} Array of {num, id} objects
 */
async function getWorkOrdersForMO(moNumber, serverUrl, token) {
  const sql = `
    SELECT wo.num, wo.id FROM wo
    JOIN moitem ON moitem.id = wo.moitemid
    JOIN mo ON mo.id = moitem.moid
    WHERE mo.num = '${escapeSqlString(moNumber)}'
    ORDER BY wo.id
  `;

  return await fishbowlQuery(sql, serverUrl, token);
}

/**
 * Get MO ID by MO number
 * @param {string} moNumber - MO number
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @returns {Promise<number|null>} MO ID or null if not found
 */
async function getMOIdByNumber(moNumber, serverUrl, token) {
  const sql = `SELECT id FROM mo WHERE num = '${escapeSqlString(moNumber)}'`;
  const rows = await fishbowlQuery(sql, serverUrl, token);
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Get existing MOs matching a pattern
 * Used for finding the next sequence number
 * @param {string} moPattern - SQL LIKE pattern (e.g., "BOM123|250106|%")
 * @param {string} serverUrl - Fishbowl server URL
 * @param {string} token - Auth token
 * @returns {Promise<Array>} Array of {num} objects
 */
async function getExistingMOsByPattern(moPattern, serverUrl, token) {
  const sql = `SELECT num FROM mo WHERE num LIKE '${escapeSqlString(moPattern)}'`;
  return await fishbowlQuery(sql, serverUrl, token);
}

/**
 * Build location object for Fishbowl API from query result
 * @param {Object} locationRow - Row from location query
 * @returns {Object} Formatted location object for API
 */
function buildLocationObject(locationRow) {
  if (!locationRow) return null;

  return {
    Location: {
      LocationID: locationRow.location_id,
      TypeID: locationRow.location_typeid || 10,
      Name: locationRow.location_name,
      Description: locationRow.location_description || '',
      CountedAsAvailable: locationRow.countedAsAvailable !== false,
      Active: locationRow.activeflag !== false,
      Pickable: locationRow.pickable !== false,
      Receivable: locationRow.receivable !== false,
      LocationGroupID: locationRow.locationgroup_id,
      LocationGroup: {
        LocationGroupID: locationRow.locationgroup_id,
        Name: locationRow.locationgroup_name
      }
    }
  };
}

/**
 * Parse MO sequence number from MO number string
 * Format: BOM|YYMMDD|SEQ
 * @param {string} moNumber - MO number
 * @returns {number|null} Sequence number or null if invalid format
 */
function parseMOSequence(moNumber) {
  const parts = moNumber.split('|');
  if (parts.length === 3) {
    const seq = parseInt(parts[2]);
    return isNaN(seq) ? null : seq;
  }
  return null;
}

/**
 * Build MO number from components
 * @param {string} bom - BOM number
 * @param {Date} date - Date for MO
 * @param {number} sequence - Sequence number
 * @returns {string} Formatted MO number
 */
function buildMONumber(bom, date, sequence) {
  const dateStr = date.getFullYear().toString().slice(2) +
                  String(date.getMonth() + 1).padStart(2, '0') +
                  String(date.getDate()).padStart(2, '0');

  return `${bom}|${dateStr}|${String(sequence).padStart(3, '0')}`;
}

module.exports = {
  getLocationByName,
  getWorkOrdersForMO,
  getMOIdByNumber,
  getExistingMOsByPattern,
  buildLocationObject,
  parseMOSequence,
  buildMONumber
};
