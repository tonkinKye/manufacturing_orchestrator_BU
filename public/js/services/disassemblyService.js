/**
 * Disassembly service
 * Handles STEP 2B (SELECT FINISHED GOODS FOR DISASSEMBLY)
 */

import { log } from '../utils/helpers.js';
import { state, sessionToken, sessionCredentials, getServerUrl } from '../utils/state.js';
import { updateQueueStats } from './queueService.js';

/**
 * Load finished goods on hand for disassembly
 * STEP 2B: Load finished goods
 */
export async function loadFinishedGoods() {
  try {
    log('[DISASSEMBLY] Loading finished goods on hand...\n');

    const response = await fetch('/api/get-finished-goods-on-hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: sessionCredentials.database,
        serverUrl: getServerUrl(),
        token: sessionToken,
        bomNum: state.bom,
        bomId: state.bomId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to load finished goods: ${response.statusText}`);
    }

    const data = await response.json();
    state.finishedGoods = data.finishedGoods || data || [];
    state.selectedFinishedGoods = [];

    log(`[OK] Found ${state.finishedGoods.length} finished goods on hand\n`);

    // Populate the available FG list
    renderAvailableFGList();

    // Load return locations
    await loadReturnLocations();

    // Update count
    updateFGCounts();
  } catch (e) {
    log(`[ERROR] Error loading finished goods: ${e.message}\n`);
    alert(`Error loading finished goods: ${e.message}`);
  }
}

/**
 * Load return locations for raw goods after disassembly
 * STEP 2B: Load return locations
 */
export async function loadReturnLocations() {
  try {
    const locGroupId = state.locationGroup;
    const response = await fetch('/api/get-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: getServerUrl(),
        token: sessionToken,
        locationGroupId: locGroupId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to load locations: ${response.statusText}`);
    }

    const data = await response.json();
    const locations = data.locations || [];

    const select = document.getElementById('fgReturnLocation');
    select.innerHTML = '<option value="">Select return location for raw goods</option>' +
      locations.map(loc => `<option value="${loc.location_id}">${loc.list_value}</option>`).join('');

    log(`[OK] Loaded ${locations.length} return locations\n`);
  } catch (e) {
    log(`[ERROR] Error loading return locations: ${e.message}\n`);
  }
}

/**
 * Render the available finished goods list
 * STEP 2B: Render available FG list
 */
export function renderAvailableFGList() {
  const container = document.getElementById('availableFGList');
  const searchTerm = (document.getElementById('fgSearchBox').value || '').toLowerCase();

  const filtered = state.finishedGoods.filter(fg => {
    const searchText = `${fg.barcode} ${fg.fg_part_num} ${fg.fg_description} ${fg.full_location}`.toLowerCase();
    return searchText.includes(searchTerm);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No finished goods found</div>';
    return;
  }

  container.innerHTML = filtered.map(fg => {
    const isSelected = state.selectedFinishedGoods.some(sel => sel.barcode === fg.barcode);
    if (isSelected) return ''; // Don't show in available list if already selected

    return `
      <div class="fg-item" data-barcode="${fg.barcode}" style="padding: 10px; border-bottom: 1px solid #ddd; cursor: pointer;">
        <input type="checkbox" class="fg-checkbox" data-barcode="${fg.barcode}" style="margin-right: 8px;">
        <strong>${fg.barcode}</strong><br>
        <small>${fg.fg_part_num} - ${fg.fg_description}</small><br>
        <small class="text-muted">Location: ${fg.full_location}</small><br>
        <small class="text-info">Built: ${new Date(fg.build_date).toLocaleString()}</small>
      </div>
    `;
  }).filter(html => html).join('');

  // Add click handlers
  container.querySelectorAll('.fg-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return; // Let checkbox handle itself
      const checkbox = item.querySelector('.fg-checkbox');
      checkbox.checked = !checkbox.checked;
    });
  });

  updateFGCounts();
}

/**
 * Render the selected finished goods list
 * STEP 2B: Render selected FG list
 */
export function renderSelectedFGList() {
  const container = document.getElementById('selectedFGList');

  if (state.selectedFinishedGoods.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No finished goods selected</div>';
    document.getElementById('btnConfirmDisassembly').disabled = true;
    return;
  }

  container.innerHTML = state.selectedFinishedGoods.map(fg => `
    <div class="fg-item" data-barcode="${fg.barcode}" style="padding: 10px; border-bottom: 1px solid #ddd; cursor: pointer;">
      <input type="checkbox" class="fg-selected-checkbox" data-barcode="${fg.barcode}" style="margin-right: 8px;">
      <strong>${fg.barcode}</strong><br>
      <small>${fg.fg_part_num} - ${fg.fg_description}</small><br>
      <small class="text-muted">Location: ${fg.full_location}</small><br>
      <small class="text-info">Built: ${new Date(fg.build_date).toLocaleString()}</small>
    </div>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.fg-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      const checkbox = item.querySelector('.fg-selected-checkbox');
      checkbox.checked = !checkbox.checked;
    });
  });

  // Enable confirm button if location is selected
  const locationSelected = document.getElementById('fgReturnLocation').value;
  document.getElementById('btnConfirmDisassembly').disabled = !locationSelected;

  updateFGCounts();
}

/**
 * Update finished goods counts in UI
 * STEP 2B: Update FG counts
 */
export function updateFGCounts() {
  const availableCount = state.finishedGoods.length - state.selectedFinishedGoods.length;
  document.getElementById('availableFGCount').textContent = availableCount;
  document.getElementById('selectedFGCount').textContent = state.selectedFinishedGoods.length;
}

/**
 * Add selected finished goods from available list to selected list
 * STEP 2B: Add selected FG
 */
export function addSelectedFG() {
  const checkboxes = document.querySelectorAll('#availableFGList .fg-checkbox:checked');
  const barcodesToAdd = Array.from(checkboxes).map(cb => cb.getAttribute('data-barcode'));

  barcodesToAdd.forEach(barcode => {
    const fg = state.finishedGoods.find(f => f.barcode === barcode);
    if (fg && !state.selectedFinishedGoods.some(sel => sel.barcode === barcode)) {
      state.selectedFinishedGoods.push(fg);
    }
  });

  renderAvailableFGList();
  renderSelectedFGList();
}

/**
 * Add all finished goods to selected list
 * STEP 2B: Add all FG
 */
export function addAllFG() {
  state.selectedFinishedGoods = [...state.finishedGoods];
  renderAvailableFGList();
  renderSelectedFGList();
}

/**
 * Remove selected finished goods from selected list
 * STEP 2B: Remove selected FG
 */
export function removeSelectedFG() {
  const checkboxes = document.querySelectorAll('#selectedFGList .fg-selected-checkbox:checked');
  const barcodesToRemove = Array.from(checkboxes).map(cb => cb.getAttribute('data-barcode'));

  state.selectedFinishedGoods = state.selectedFinishedGoods.filter(
    fg => !barcodesToRemove.includes(fg.barcode)
  );

  renderAvailableFGList();
  renderSelectedFGList();
}

/**
 * Remove all finished goods from selected list
 * STEP 2B: Remove all FG
 */
export function removeAllFG() {
  state.selectedFinishedGoods = [];
  renderAvailableFGList();
  renderSelectedFGList();
}

/**
 * Confirm disassembly and queue work orders
 * STEP 2B: Confirm disassembly
 */
export async function confirmDisassembly() {
  const returnLocation = document.getElementById('fgReturnLocation').value;

  if (!returnLocation) {
    return alert('Please select a return location for raw goods');
  }

  if (state.selectedFinishedGoods.length === 0) {
    return alert('Please select at least one finished good to disassemble');
  }

  try {
    log(`\n[DISASSEMBLY] Queuing ${state.selectedFinishedGoods.length} finished goods for disassembly...\n`);

    // Queue each FG for disassembly
    for (const fg of state.selectedFinishedGoods) {
      // Query the original WO structure to get exact parts, quantities, and tracking
      log(`[DISASSEMBLY] Querying original WO structure for ${fg.wo_number}...\n`);

      try {
        const woStructureResponse = await fetch('/api/fishbowl/workorder-structure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverUrl: getServerUrl(),
            token: sessionToken,
            woNumber: fg.wo_number
          })
        });

        if (!woStructureResponse.ok) {
          const errorText = await woStructureResponse.text();
          log(`[ERROR] Failed to query WO structure: ${woStructureResponse.status} ${errorText}\n`);
          throw new Error(`Failed to query WO structure for ${fg.wo_number}: ${woStructureResponse.statusText}`);
        }

        const woStructure = await woStructureResponse.json();
        log(`[OK] Retrieved ${woStructure.length} items from original WO ${fg.wo_number}\n`);

        const queueData = {
          serverUrl: getServerUrl(),
          token: sessionToken,
          database: sessionCredentials.database,
          barcode: fg.barcode,
          serialNumbers: fg.serial_numbers, // Legacy field, kept for compatibility
          fgLocationId: returnLocation,
          rawGoodsPartId: null, // Not applicable for disassembly
          fgPartId: fg.fg_part_id,
          bomNum: state.bom,
          bomId: state.bomId,
          locationGroupId: state.locationGroup,
          operationType: 'disassemble',
          originalWoStructure: JSON.stringify(woStructure) // Store complete WO structure
        };

        const response = await fetch('/api/queue-work-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queueData)
        });

        if (!response.ok) {
          const errorText = await response.text();
          log(`[ERROR] Failed to queue: ${response.status} ${errorText}\n`);
          throw new Error(`Failed to queue ${fg.barcode}: ${response.statusText}`);
        }

        log(`[OK] Queued: ${fg.barcode}\n`);
      } catch (error) {
        log(`[ERROR] Error processing ${fg.barcode}: ${error.message}\n`);
        throw error; // Re-throw to be caught by outer try-catch
      }
    }

    log(`[OK] Successfully queued ${state.selectedFinishedGoods.length} finished goods\n`);
    alert(`Successfully queued ${state.selectedFinishedGoods.length} finished goods for disassembly`);

    // Disable step 2b to prevent re-queueing
    const step2b = document.getElementById('step2b');
    step2b.classList.add('disabled');
    step2b.style.opacity = '0.5';
    step2b.style.pointerEvents = 'none';

    // Collapse the step
    const collapseElement = document.getElementById('collapseStep2b');
    if (collapseElement && window.jQuery) {
      window.jQuery('#collapseStep2b').collapse('hide');
    }

    // Disable the button
    document.getElementById('btnConfirmDisassembly').disabled = true;

    // Enable Step 4 to process the queue (dynamically import enableStep)
    const { enableStep } = await import('../ui/stepManager.js');
    enableStep(4);

    await updateQueueStats();
  } catch (e) {
    log(`[ERROR] Error queuing disassembly: ${e.message}\n`);
    alert(`Error queuing disassembly: ${e.message}`);
  }
}
