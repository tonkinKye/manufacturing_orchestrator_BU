/**
 * CSV loading, mapping, and validation service
 * Handles STEP 2 (Load CSV) and STEP 3 (Map columns & validate)
 */

import { log, kv, populateSelect, setHTML } from '../utils/helpers.js';
import { state, sessionToken, sessionCredentials, getServerUrl } from '../utils/state.js';
import { fishbowlQuery } from '../api/fishbowlApi.js';

/**
 * Load CSV file from file input
 * STEP 2: Load CSV
 */
export async function loadCSV() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return;

  await processCSVFile(file);
}

/**
 * Process a CSV file (used by both file input and drag & drop)
 */
async function processCSVFile(file) {
  if (!file) return;

  // Validate file type
  if (!file.name.endsWith('.csv')) {
    alert('Please select a CSV file');
    return;
  }

  try {
    log('Loading CSV file...\n');
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter(l => l.trim());
    const parseRow = (line) => line.split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim());

    state.csvData = { filename: file.name, rows: lines.map(parseRow), text };

    document.getElementById('csvFileName').textContent = file.name;
    document.getElementById('csvRowCount').textContent = lines.length;
    document.getElementById('csvInfo').style.display = 'block';

    log(`[OK] CSV Loaded: ${file.name}\n   Rows: ${lines.length}\n   Columns: ${state.csvData.rows[0].length}\n`);

    // Enable step 3 (requires enableStep from UI module)
    const { enableStep } = await import('../ui/stepManager.js');
    enableStep(3);

    showMappingInterface();
    await loadLocations();
    await loadRawGoods();
  } catch (e) {
    log(`[ERROR] Error loading CSV: ${e.message}\n`);
    alert(`Error: ${e.message}`);
  }
}

/**
 * Handle drag over event
 */
export function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropZone = document.getElementById('csvDropZone');
  if (dropZone) {
    dropZone.classList.add('drag-over');
  }
}

/**
 * Handle drag leave event
 */
export function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropZone = document.getElementById('csvDropZone');
  if (dropZone) {
    dropZone.classList.remove('drag-over');
  }
}

/**
 * Handle file drop event
 */
export async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const dropZone = document.getElementById('csvDropZone');
  if (dropZone) {
    dropZone.classList.remove('drag-over');
  }

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  // Update the file input to reflect the dropped file
  const fileInput = document.getElementById('csvFile');
  if (fileInput) {
    // Create a new FileList-like object with the dropped file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
  }

  await processCSVFile(file);
}

/**
 * Show CSV mapping interface with preview
 * STEP 3: Map columns
 */
export function showMappingInterface() {
  const firstRow = state.csvData.rows[0];
  const previewRows = state.csvData.rows.slice(0, 3);

  let tableHtml = '<table class="csv-preview-table table table-bordered table-condensed">';
  previewRows.forEach((row, idx) => {
    const tag = idx === 0 ? 'th' : 'td';
    tableHtml += '<tr>' + row.map(cell => `<${tag}>${cell || '<em>(empty)</em>'}</${tag}>`).join('') + '</tr>';
  });
  document.getElementById('csvPreview').innerHTML = tableHtml + '</table>';

  const opts = firstRow.map((col, idx) => `<option value="${idx}">${idx + 1}: ${col || `Column ${idx + 1}`}</option>`).join('');
  document.getElementById('serialColumn').innerHTML = document.getElementById('barcodeColumn').innerHTML = opts;

  const lowerHeaders = firstRow.map(h => (h || '').toLowerCase());
  const serialIdx = lowerHeaders.findIndex(h => h.includes('serial') || h.includes('sn'));
  const barcodeIdx = lowerHeaders.findIndex(h => h.includes('barcode') || h.includes('bc'));

  document.getElementById('serialColumn').value = serialIdx !== -1 ? serialIdx : 0;
  document.getElementById('barcodeColumn').value = barcodeIdx !== -1 ? barcodeIdx : Math.min(1, firstRow.length - 1);
  log('CSV columns detected automatically\n');
}

/**
 * Load locations from Fishbowl for selected location group
 */
export async function loadLocations() {
  try {
    log('Loading locations...\n');
    const select = document.getElementById('fgLocation');

    const sql = `SELECT DISTINCT CONCAT(locationgroup.name,'-',location.name) AS location_list FROM location JOIN locationgroup ON locationgroup.id = location.locationgroupid WHERE location.activeflag = 1 AND locationgroup.activeflag = 1 AND locationgroup.id = ${state.locationGroup} ORDER BY locationgroup.name, location.name`;
    const rows = await fishbowlQuery(sql);

    if (!rows.length) {
      select.innerHTML = '<option value="">No locations found</option>';
      return log('[WARN] No active locations found\n');
    }

    const opts = rows.map(r => {
      const loc = kv(r, 'location_list');
      return `<option value="${loc}">${loc}</option>`;
    });
    populateSelect('fgLocation', opts, '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> Select a location');

    if (state.bomDefaultLocation) {
      select.value = state.bomDefaultLocation;
      log(`[OK] Loaded ${rows.length} location(s) from location group\n[OK] Default location pre-selected: ${state.bomDefaultLocation}\n`);
    } else {
      log(`[OK] Loaded ${rows.length} location(s) from location group\n[WARN] No default location configured for this BOM\n`);
    }
  } catch (e) {
    log(`[ERROR] Error loading locations: ${e.message}\n`);
  }
}

/**
 * Load raw goods with serial tracking from Fishbowl
 */
export async function loadRawGoods() {
  try {
    log('Loading raw goods with serial tracking...\n');
    const select = document.getElementById('rawGoodPart');
    const serverUrl = getServerUrl();

    const response = await fetch('/api/get-raw-goods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: serverUrl,
        token: sessionToken,
        bomNum: state.bom
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rows = await response.json();

    if (!rows || !rows.length) {
      select.innerHTML = '<option value="">No tracked raw goods found</option>';
      log('[ERROR] No raw goods with serial tracking found for this BOM\n');
      alert('ERROR: No raw goods with serial tracking (Part Tracking Type = Serial Number) found for this BOM.\n\nPlease verify the BOM configuration.');
      return;
    }

    const opts = rows.map(r => {
      const partId = kv(r, 'part_id');
      const listValue = kv(r, 'list_values');
      return `<option value="${partId}">${listValue}</option>`;
    });
    populateSelect('rawGoodPart', opts, '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> Select raw good part');

    log(`[OK] Loaded ${rows.length} tracked raw good(s)\n`);
  } catch (e) {
    log(`[ERROR] Error loading raw goods: ${e.message}\n`);
    document.getElementById('rawGoodPart').innerHTML = '<option value="">Error loading raw goods</option>';
  }
}

/**
 * Validate CSV data and prepare for queue
 * STEP 3: Validate
 */
export async function validateAndPrepare() {
  const fgLocation = document.getElementById('fgLocation').value;
  if (!fgLocation) return alert('Please select a finished good location');

  const rawGoodPartId = document.getElementById('rawGoodPart').value;
  if (!rawGoodPartId) return alert('Please select a raw good part for serial number allocation');

  const hasHeaders = document.getElementById('hasHeaders').checked;
  const serialIdx = parseInt(document.getElementById('serialColumn').value, 10);
  const barcodeIdx = parseInt(document.getElementById('barcodeColumn').value, 10);

  if (serialIdx === barcodeIdx) return alert('Serial and Barcode columns cannot be the same');

  log(`\n${'='.repeat(60)}\nVALIDATING CSV DATA\n${'='.repeat(60)}\n`);

  const dataRows = [];
  for (let i = hasHeaders ? 1 : 0; i < state.csvData.rows.length; i++) {
    const row = state.csvData.rows[i];
    const serial = (row[serialIdx] || '').trim();
    const barcode = (row[barcodeIdx] || '').trim();
    if (serial && barcode) dataRows.push({ serial, barcode });
  }

  if (!dataRows.length) return alert('No valid data rows found');

  const chunks = new Map();
  dataRows.forEach(row => {
    if (!chunks.has(row.barcode)) chunks.set(row.barcode, []);
    chunks.get(row.barcode).push(row.serial);
  });

  state.mapping = { hasHeaders, serialIdx, barcodeIdx };
  state.chunks = chunks;

  log(`Parsed ${dataRows.length} serial(s) across ${chunks.size} barcode(s)\n`);

  const allSerials = [], allBarcodes = [];
  for (const [barcode, serials] of state.chunks) {
    allSerials.push(...serials);
    allBarcodes.push(barcode);
  }
  const uniqueSerials = [...new Set(allSerials)];
  const uniqueBarcodes = [...new Set(allBarcodes)];

  log(`Checking ${uniqueSerials.length} unique serial(s) in Fishbowl...\n`);

  const serialsInClause = uniqueSerials.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  const findSerialsSQL = `SELECT DISTINCT tisn.serialnum AS serial FROM serialnum tisn JOIN serial s ON s.id = tisn.serialid JOIN tag t ON t.id = s.tagid WHERE tisn.parttrackingid = 4 AND tisn.serialnum IN (${serialsInClause})`;

  let foundSerials = [];
  try {
    foundSerials = await fishbowlQuery(findSerialsSQL);
    log(`[OK] Found ${foundSerials.length} serial(s) in Fishbowl\n`);
  } catch (e) {
    log(`[ERROR] Error querying serials: ${e.message}\n`);
    return alert('Error validating serials. Check the log for details.');
  }

  log(`Checking ${uniqueBarcodes.length} unique barcode(s) in Fishbowl...\n`);
  const barcodesInClause = uniqueBarcodes.map(b => `'${b.replace(/'/g, "''")}'`).join(',');
  const findBarcodesSQL = `SELECT DISTINCT tisn.serialnum AS barcode FROM serialnum tisn JOIN serial s ON s.id = tisn.serialid JOIN tag t ON t.id = s.tagid WHERE tisn.parttrackingid = 5 AND tisn.serialnum IN (${barcodesInClause})`;

  let existingBarcodes = [];
  try {
    existingBarcodes = await fishbowlQuery(findBarcodesSQL);
    log(existingBarcodes.length > 0 ? `[WARN] Found ${existingBarcodes.length} barcode(s) that already exist in Fishbowl\n` : '[OK] No barcode conflicts found\n');
  } catch (e) {
    log(`[ERROR] Error querying barcodes: ${e.message}\n`);
    return alert('Error validating barcodes. Check the log for details.');
  }

  const foundSerialSet = new Set(foundSerials.map(r => String(kv(r, 'serial')).trim()));
  const existingBarcodeSet = new Set(existingBarcodes.map(r => String(kv(r, 'barcode')).trim()));
  const validChunks = new Map();
  const excludedDueToBarcodeExists = [], excludedDueToMissingSerials = [];

  for (const [barcode, serials] of state.chunks) {
    if (existingBarcodeSet.has(String(barcode).trim())) {
      excludedDueToBarcodeExists.push({ barcode, serials, reason: 'Barcode already exists in Fishbowl' });
      log(`[WARN] Excluding barcode ${barcode}: Already exists in Fishbowl\n`);
    } else {
      const missingSerials = serials.filter(s => !foundSerialSet.has(String(s).trim()));
      if (missingSerials.length > 0) {
        excludedDueToMissingSerials.push({ barcode, serials, missingSerials, reason: `${missingSerials.length} serial(s) not found in Fishbowl` });
        log(`[WARN] Excluding barcode ${barcode}: ${missingSerials.length} serial(s) not found\n   Missing: ${missingSerials.join(', ')}\n`);
      } else {
        validChunks.set(barcode, serials);
      }
    }
  }

  const excludedChunks = [...excludedDueToBarcodeExists, ...excludedDueToMissingSerials];

  log(`\n${'='.repeat(60)}\nVALIDATION SUMMARY\n${'='.repeat(60)}\nTotal Barcodes: ${state.chunks.size}\n[OK] Valid: ${validChunks.size}\n[ERROR] Excluded: ${excludedChunks.length}\n`);

  state.validationResults = {
    valid: validChunks,
    excludedBarcodeExists: excludedDueToBarcodeExists,
    excludedMissingSerials: excludedDueToMissingSerials,
    fgLocation: fgLocation,
    rawGoodPartId: rawGoodPartId
  };

  displayValidationResults();
}

/**
 * Display validation results in UI
 */
export function displayValidationResults() {
  const results = state.validationResults;
  const validCount = results.valid.size;
  const excludedCount = results.excludedBarcodeExists.length + results.excludedMissingSerials.length;

  let summaryHtml = `
    <strong>Validation Complete:</strong><br>
    <img src="images/check.svg" class="icon" alt="Success"> Valid Barcodes: <strong>${validCount}</strong><br>
    <img src="images/x.svg" class="icon" alt="Error"> Excluded Barcodes: <strong>${excludedCount}</strong><br>
  `;

  if (validCount > 0) {
    let totalSerials = 0;
    for (const serials of results.valid.values()) totalSerials += serials.length;
    summaryHtml += `Total Serials (Valid): <strong>${totalSerials}</strong><br>`;
    summaryHtml += `Finished Good Location: <strong>${results.fgLocation}</strong><br>`;
  }

  document.getElementById('validationSummary').innerHTML = summaryHtml;

  if (excludedCount > 0) {
    let issuesHtml = '<strong><img src="images/warning.svg" class="icon" alt="Warning"> Issues Found:</strong><br><br>';

    if (results.excludedBarcodeExists.length > 0) {
      issuesHtml += `<strong>Barcode Already Exists (${results.excludedBarcodeExists.length}):</strong><br>`;
      results.excludedBarcodeExists.forEach(item => {
        issuesHtml += `<img src="images/package.svg" class="icon" alt="Package"> ${item.barcode}<br>`;
      });
      issuesHtml += '<br>';
    }

    if (results.excludedMissingSerials.length > 0) {
      issuesHtml += `<strong>Missing Serial Numbers (${results.excludedMissingSerials.length}):</strong><br>`;
      results.excludedMissingSerials.forEach(item => {
        issuesHtml += `<img src="images/package.svg" class="icon" alt="Package"> ${item.barcode}: ${item.missingSerials.length} missing (${item.missingSerials.slice(0, 3).join(', ')}${item.missingSerials.length > 3 ? '...' : ''})<br>`;
      });
    }

    issuesHtml += '<br><button id="btnDownloadExcluded" class="btn btn-warning btn-sm"><img src="images/save.svg" class="icon" alt="Download"> Download Excluded Items (CSV)</button>';

    document.getElementById('validationIssues').innerHTML = issuesHtml;
    document.getElementById('validationIssues').style.display = 'block';

    // Wire up the download button
    document.getElementById('btnDownloadExcluded').addEventListener('click', downloadExcludedCSV);
  } else {
    document.getElementById('validationIssues').style.display = 'none';
  }

  if (validCount > 0) {
    document.getElementById('btnSaveToQueue').style.display = 'block';
  } else {
    document.getElementById('btnSaveToQueue').style.display = 'none';
    alert('⚠ No valid items to process!\n\nAll barcodes were excluded due to validation errors.\n\nPlease fix the issues and try again.');
  }

  document.getElementById('validationResults').style.display = 'block';
}

/**
 * Download excluded items as CSV
 */
export function downloadExcludedCSV() {
  const results = state.validationResults;

  let csvContent = 'Barcode,SerialNumber,IssueType,Details\n';

  // Add barcodes that already exist - ALL serials in the chunk get this error
  results.excludedBarcodeExists.forEach(item => {
    const barcode = item.barcode;
    const serials = item.serials;

    serials.forEach(serial => {
      csvContent += `"${barcode}","${serial}","Barcode Already Exists","Barcode ${barcode} already exists in Fishbowl"\n`;
    });
  });

  // Add barcodes with missing serials - show each serial with its specific status
  results.excludedMissingSerials.forEach(item => {
    const barcode = item.barcode;
    const allSerials = item.serials;
    const missingSerials = new Set(item.missingSerials);

    allSerials.forEach(serial => {
      if (missingSerials.has(serial)) {
        // This serial is missing from Fishbowl
        csvContent += `"${barcode}","${serial}","Missing Serial","Serial ${serial} not found in Fishbowl"\n`;
      } else {
        // This serial exists but chunk is excluded due to other missing serials
        csvContent += `"${barcode}","${serial}","Excluded Due to Other Missing Serials","Valid serial but chunk excluded"\n`;
      }
    });
  });

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `excluded-items-${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  log('[EXPORT] Downloaded excluded items CSV with detailed serial-level information\n');
}

/**
 * Save validated items to queue
 */
export async function saveToQueue() {
  const results = state.validationResults;

  if (!results || results.valid.size === 0) {
    return alert('No valid items to save');
  }

  try {
    log(`\n${'='.repeat(60)}\nSAVING TO QUEUE\n${'='.repeat(60)}\n`);

    // Get config to get database name
    const configResponse = await fetch('/api/load-config');
    const config = await configResponse.json();

    if (!config.database) {
      throw new Error('Database not configured');
    }

    // Check for existing PENDING records with these barcodes
    log(`Checking for existing PENDING records...\n`);

    const barcodes = Array.from(results.valid.keys());

    const checkResponse = await fetch('/api/mysql/delete-pending-barcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: config.database,
        barcodes: barcodes
      })
    });

    if (!checkResponse.ok) {
      throw new Error('Failed to check for existing records');
    }

    const checkResult = await checkResponse.json();

    if (checkResult.deletedCount > 0) {
      log(`[CLEANUP] Found and deleted ${checkResult.deletedCount} existing PENDING record(s)\n`);
      log(`[INFO] Barcodes cleaned up: ${checkResult.barcodes.slice(0, 5).join(', ')}${checkResult.barcodes.length > 5 ? '...' : ''}\n`);
      log(`[REASON] Removing stale records from previous attempts\n`);
    } else {
      log(`[OK] No existing PENDING records found - starting fresh\n`);
    }

    // Now insert the new records
    log(`Saving ${results.valid.size} barcode(s) to queue...\n`);

    const items = [];
    for (const [barcode, serials] of results.valid) {
      const serialsJson = JSON.stringify(serials);
      items.push({
        barcode: barcode,
        serialNumbers: serialsJson,
        fgLocation: results.fgLocation,
        rawGoodsPartId: results.rawGoodPartId,
        bomNum: state.bom,
        bomId: state.bomId,
        locationGroupId: state.locationGroup
      });
    }

    const insertResponse = await fetch('/api/mysql/batch-queue-work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: config.database,
        items: items
      })
    });

    if (!insertResponse.ok) {
      throw new Error('Failed to insert records');
    }

    const insertResult = await insertResponse.json();

    log(`[OK] Saved ${results.valid.size} item(s) to queue\n`);

    let alertMessage = `✓ Successfully saved ${results.valid.size} item(s) to queue!`;

    if (checkResult.deletedCount > 0) {
      alertMessage += `\n\n⚠ Note: ${checkResult.deletedCount} previous PENDING record(s) were replaced with your new data.`;
    }

    alertMessage += `\n\nProceed to Step 4 to process.`;

    alert(alertMessage);

    // Enable step 4 and update queue stats
    const { enableStep } = await import('../ui/stepManager.js');
    enableStep(4);

    const { updateQueueStats } = await import('./queueService.js');
    await updateQueueStats();

  } catch (e) {
    log(`[ERROR] Error saving to queue: ${e.message}\n`);
    alert(`Error saving to queue: ${e.message}`);
  }
}
