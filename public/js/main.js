/**
 * Main entry point for Manufacturing Orchestrator
 * Initializes the application and sets up event listeners
 */

import { log } from './utils/helpers.js';
import { login, logout, loadConfig, restoreSessionIfAvailable } from './services/authService.js';
import { loadLocationGroups, onLocationGroupChange, selectBOM, selectOperationType } from './services/workOrderService.js';
import { loadCSV, validateAndPrepare, saveToQueue, handleDragOver, handleDragLeave, handleDrop } from './services/csvService.js';
import {
  renderAvailableFGList,
  addSelectedFG,
  addAllFG,
  removeSelectedFG,
  removeAllFG,
  renderSelectedFGList,
  confirmDisassembly
} from './services/disassemblyService.js';
import { processQueue, checkAndResumeJob } from './services/queueService.js';

/**
 * Initialize application on DOM ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Display welcome message
    log('='.repeat(60) + '\n');
    log('Manufacturing Orchestrator (Queue-Based)\n');
    log('='.repeat(60) + '\n');
    log('Proxy server required: Run "node server.js" first\n');
    log('Then open http://localhost:3000/\n');
    log('Uses database queue for fault-tolerant processing\n\n');

    // Load configuration
    await loadConfig();

    // Restore session from storage (if available)
    const sessionRestored = await restoreSessionIfAvailable();

    if (sessionRestored) {
      log('[SESSION] Session restored from browser storage\n');

      // Load location groups since we're logged in
      try {
        await loadLocationGroups();
        log('[OK] Location groups loaded for restored session\n');
      } catch (e) {
        log(`[WARN] Could not load location groups: ${e.message}\n`);
      }
    }

    // Check for active job immediately
    const jobResumed = await checkAndResumeJob();

    // Set up event listeners
    setupEventListeners();

    // Display ready message
    if (!jobResumed) {
      if (sessionRestored) {
        log('Session restored! You can continue working or start a new job.\n');
      } else {
        log('Ready! Enter your Fishbowl credentials and click Login to begin.\n');
      }
    }

  } catch (err) {
    log(`[ERROR] Initialization error: ${err.message}\n`);
    console.error('Init error:', err);
  }
});

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Settings button
  document.getElementById('btnSettings')?.addEventListener('click', () => {
    window.location.href = '/setup.html';
  });

  // Authentication
  document.getElementById('btnLogin')?.addEventListener('click', login);
  document.getElementById('btnLogout')?.addEventListener('click', logout);

  // Step 1: Location Group & BOM Selection
  document.getElementById('locationGroupSelect')?.addEventListener('change', onLocationGroupChange);
  document.getElementById('btnSelectBOM')?.addEventListener('click', selectBOM);

  // Step 1.5: Operation type selection
  document.getElementById('panelBuild')?.addEventListener('click', () => selectOperationType('build'));
  document.getElementById('panelDisassemble')?.addEventListener('click', () => selectOperationType('disassemble'));

  // Step 2: BUILD path (CSV)
  document.getElementById('csvFile')?.addEventListener('change', loadCSV);
  document.getElementById('btnValidate')?.addEventListener('click', validateAndPrepare);
  document.getElementById('btnSaveToQueue')?.addEventListener('click', saveToQueue);

  // Step 2: Drag and drop for CSV file
  const csvDropZone = document.getElementById('csvDropZone');
  if (csvDropZone) {
    csvDropZone.addEventListener('dragover', handleDragOver);
    csvDropZone.addEventListener('dragleave', handleDragLeave);
    csvDropZone.addEventListener('drop', handleDrop);
  }

  // Step 2B: DISASSEMBLE path (FG selection)
  document.getElementById('fgSearchBox')?.addEventListener('input', renderAvailableFGList);
  document.getElementById('btnAddSelectedFG')?.addEventListener('click', addSelectedFG);
  document.getElementById('btnAddAllFG')?.addEventListener('click', addAllFG);
  document.getElementById('btnRemoveSelectedFG')?.addEventListener('click', removeSelectedFG);
  document.getElementById('btnRemoveAllFG')?.addEventListener('click', removeAllFG);
  document.getElementById('fgReturnLocation')?.addEventListener('change', renderSelectedFGList);
  document.getElementById('btnConfirmDisassembly')?.addEventListener('click', confirmDisassembly);

  // Step 4: Process queue
  document.getElementById('btnProcess')?.addEventListener('click', processQueue);

  // Log management
  document.getElementById('btnClearLog')?.addEventListener('click', () => {
    document.getElementById('log').textContent = 'Log cleared.\n';
  });

  log('[INIT] Event listeners registered\n');
}
