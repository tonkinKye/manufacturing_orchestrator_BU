/**
 * Work Order configuration service
 * Handles STEP 1 (Location group & BOM selection) and STEP 1.5 (Operation type selection)
 */

import { log, kv, populateSelect } from '../utils/helpers.js';
import { state } from '../utils/state.js';
import { fishbowlQuery } from '../api/fishbowlApi.js';
import { enableStep } from '../ui/stepManager.js';

// Store BOM data globally (similar to window.bomData in original)
let bomDataCache = new Map();

/**
 * Get BOM data cache
 */
export function getBomData() {
  return bomDataCache;
}

/**
 * Set BOM data cache
 */
export function setBomData(data) {
  bomDataCache = data;
}

/**
 * Load location groups from Fishbowl
 * STEP 1: Location group selection
 */
export async function loadLocationGroups() {
  try {
    log('Loading location groups...\n');
    const sql = "SELECT locationgroup.name AS locationgroupnamelistvalue, locationgroup.id AS locgid FROM locationgroup WHERE locationgroup.activeflag = 1 ORDER BY 1";
    const rows = await fishbowlQuery(sql);

    if (!rows.length) {
      populateSelect('locationGroupSelect', [], 'No location groups found');
      return log('[WARN] No active location groups found\n');
    }

    const opts = rows.map(r => {
      const locgid = kv(r, 'locgid');
      const name = kv(r, 'locationgroupnamelistvalue');
      return `<option value="${locgid}">${name}</option>`;
    });
    populateSelect('locationGroupSelect', opts, '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> Select a location group');
    log(`[OK] Loaded ${rows.length} location group(s)\n`);
  } catch (e) {
    log(`[ERROR] Error loading location groups: ${e.message}\n`);
    console.error('Full error:', e);
  }
}

/**
 * Handle location group change event
 * STEP 1: Trigger BOM loading when location group is selected
 */
export async function onLocationGroupChange() {
  const locGroupId = document.getElementById('locationGroupSelect').value;
  const bomSelect = document.getElementById('bomSelect');
  const btnSelectBOM = document.getElementById('btnSelectBOM');

  if (!locGroupId) {
    bomSelect.disabled = btnSelectBOM.disabled = true;
    bomSelect.innerHTML = '<option value=""><img src="images/clipboard.svg" class="icon" alt="Clipboard"> First select a location group</option>';
    return;
  }

  state.locationGroup = locGroupId;
  bomSelect.disabled = false;
  await loadBOMs(locGroupId);
}

/**
 * Load BOMs for selected location group
 * STEP 1: BOM loading
 */
export async function loadBOMs(locGroupId) {
  try {
    log(`Loading BOMs for location group ${locGroupId}...\n`);
    const sql = `SELECT bom.id AS bomid, bom.num, CONCAT(bom.num,' - ',bom.description) AS bom_list_value, locationgroup.id AS locgid, location.id AS locid, CONCAT(locationgroup.name,'-',location.name) AS location_list_value FROM bom JOIN bomitem ON bomitem.bomid = bom.id AND bomitem.typeid = 10 LEFT JOIN defaultlocation df ON df.partId = bomitem.partid AND df.locationGroupId = ${locGroupId} LEFT JOIN location ON location.id = df.locationid LEFT JOIN locationgroup ON locationgroup.id = location.locationgroupid WHERE bom.activeflag = 1 GROUP BY bom.id, bom.num, bom.description, locationgroup.id, location.id, locationgroup.name, location.name ORDER BY bom.num`;
    const rows = await fishbowlQuery(sql);

    if (!rows.length) {
      populateSelect('bomSelect', [], 'No BOMs found');
      return log('[WARN] No active BOMs found\n');
    }

    bomDataCache = new Map();
    const opts = rows.map(r => {
      const num = kv(r, 'num');
      bomDataCache.set(num, { id: kv(r, 'bomid'), defaultLocation: kv(r, 'location_list_value') });
      return `<option value="${num}">${kv(r, 'bom_list_value') || num}</option>`;
    });

    populateSelect('bomSelect', opts, '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> Select a BOM');
    document.getElementById('btnSelectBOM').disabled = false;
    log(`[OK] Loaded ${rows.length} BOM(s)\n`);
  } catch (e) {
    log(`[ERROR] Error loading BOMs: ${e.message}\n`);
  }
}

/**
 * Select BOM and update state
 * STEP 1: BOM selection confirmation
 */
export function selectBOM() {
  const locGroupSelect = document.getElementById('locationGroupSelect');
  const bomSelect = document.getElementById('bomSelect');
  const locGroupId = locGroupSelect.value;
  const bomNum = bomSelect.value;

  if (!locGroupId) return alert('Please select a location group');
  if (!bomNum) return alert('Please select a BOM');

  state.bom = bomNum;
  state.bomId = bomDataCache?.get(bomNum)?.id || null;
  state.locationGroup = locGroupId;
  state.bomDefaultLocation = bomDataCache?.get(bomNum)?.defaultLocation || null;

  document.getElementById('selectedLocationGroup').textContent = locGroupSelect.options[locGroupSelect.selectedIndex].text;
  document.getElementById('selectedBOM').textContent = bomSelect.options[bomSelect.selectedIndex].text;
  document.getElementById('selectedDefaultLocation').textContent = state.bomDefaultLocation || 'None configured';
  document.getElementById('bomInfo').style.display = 'block';

  log(`\n[OK] Configuration Selected:\n   Location Group: ${locGroupSelect.options[locGroupSelect.selectedIndex].text}\n   BOM: ${bomSelect.options[bomSelect.selectedIndex].text} (ID: ${state.bomId})\n   Default FG Location: ${state.bomDefaultLocation || 'None'}\n`);

  // Enable operation type selection (Step 1.5)
  enableStep('1_5');
}

/**
 * Select operation type (BUILD or DISASSEMBLE)
 * STEP 1.5: Operation type selection
 */
export function selectOperationType(type) {
  state.operationType = type;

  // Update panel styles to show selection
  if (type === 'build') {
    document.getElementById('panelBuild').style.border = '3px solid #5cb85c';
    document.getElementById('panelDisassemble').style.border = '1px solid #ddd';
    log('[OK] BUILD operation selected\n');

    // Hide Step 2B (disassembly), show Step 2 (BUILD/CSV)
    document.getElementById('step2b').style.display = 'none';
    document.getElementById('step2').style.display = 'block';

    // Enable step 2
    enableStep(2);

  } else if (type === 'disassemble') {
    document.getElementById('panelDisassemble').style.border = '3px solid #5bc0de';
    document.getElementById('panelBuild').style.border = '1px solid #ddd';
    log('[OK] DISASSEMBLE operation selected\n');

    // Hide Step 2 (BUILD/CSV), show Step 2B (disassembly)
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step2b').style.display = 'block';

    // Enable step 2b
    enableStep('2b');

    // Load finished goods for disassembly
    loadFinishedGoodsAsync();
  }
}

/**
 * Load finished goods for disassembly (async wrapper)
 */
async function loadFinishedGoodsAsync() {
  try {
    // Dynamic import to avoid circular dependencies
    const { loadFinishedGoods } = await import('./disassemblyService.js');
    await loadFinishedGoods();
  } catch (e) {
    log(`[WARN] Could not load finished goods: ${e.message}\n`);
    log('[INFO] If disassembly functionality is not yet implemented, this is expected.\n');
  }
}
