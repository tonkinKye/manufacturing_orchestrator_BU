/**
 * Authentication and session management service
 */

import { APP_CONFIG } from '../config.js';
import { log, setHTML, toggleDisplay, setButtonEnabled } from '../utils/helpers.js';
import { setSessionToken, setSessionCredentials, clearSession, getServerUrl } from '../utils/state.js';
import { detectDatabaseName } from '../api/fishbowlApi.js';
import { initializeQueueTable } from '../api/queueApi.js';

/**
 * Save session to local storage
 */
export function saveSessionToStorage(token, credentials) {
  try {
    localStorage.setItem(APP_CONFIG.sessionStorageKey, JSON.stringify({
      token: token,
      serverUrl: getServerUrl(),
      username: credentials.username,
      password: credentials.password,
      database: credentials.database,
      timestamp: Date.now()
    }));
    log('[SESSION] Session saved to browser storage\n');
  } catch (e) {
    log(`[WARN] Could not save session: ${e.message}\n`);
  }
}

/**
 * Load session from local storage
 */
export function loadSessionFromStorage() {
  try {
    const stored = localStorage.getItem(APP_CONFIG.sessionStorageKey);
    if (!stored) return null;

    const session = JSON.parse(stored);

    // Check if session is less than 24 hours old
    const age = Date.now() - session.timestamp;
    if (age > APP_CONFIG.sessionMaxAge) {
      log('[SESSION] Stored session expired (>24 hours)\n');
      localStorage.removeItem(APP_CONFIG.sessionStorageKey);
      return null;
    }

    return session;
  } catch (e) {
    log(`[WARN] Could not load session: ${e.message}\n`);
    return null;
  }
}

/**
 * Clear session from local storage
 */
export function clearSessionFromStorage() {
  try {
    localStorage.removeItem(APP_CONFIG.sessionStorageKey);
    log('[SESSION] Session cleared from browser storage\n');
  } catch (e) {
    log(`[WARN] Could not clear session: ${e.message}\n`);
  }
}

/**
 * Restore session from storage if available
 */
export async function restoreSessionIfAvailable() {
  const storedSession = loadSessionFromStorage();

  if (!storedSession) {
    log('[SESSION] No stored session found\n');
    return false;
  }

  log('[SESSION] Found stored session, attempting to restore...\n');

  try {
    // Restore session variables
    setSessionToken(storedSession.token);
    setSessionCredentials({
      username: storedSession.username,
      password: storedSession.password,
      database: storedSession.database || ''
    });

    // Note: No need to restore UI fields anymore since credentials come from secure config

    // Test if token is still valid by making a simple query
    try {
      const { fishbowlQuery } = await import('../api/fishbowlApi.js');
      await fishbowlQuery('SELECT 1 as test');

      log('[SESSION] Session restored successfully\n');

      // Update UI to show logged in state
      document.getElementById('sessionStatus').innerHTML =
        `<span class="text-success"><img src="images/check.svg" class="icon" alt="Success"> Logged in as ${storedSession.username} (restored)</span>`;
      toggleDisplay('btnLogin', false);
      toggleDisplay('btnLogout', true);

      document.getElementById('serverUrl').disabled = true;
      document.getElementById('username').disabled = true;
      document.getElementById('password').disabled = true;

      // Enable Step 1 since we're logged in
      document.getElementById('step1').classList.remove('disabled');
      document.getElementById('step1').style.opacity = '1';
      document.getElementById('step1').style.pointerEvents = 'auto';
      $('#collapseStep1').collapse('show');

      // Check for pending jobs from previous interrupted run
      log('[SESSION] Checking for pending jobs from previous session...\n');
      const { checkForPendingJobs, updateQueueStats } = await import('./queueService.js');
      const { enableStep } = await import('../ui/stepManager.js');
      const shouldResume = await checkForPendingJobs();

      if (shouldResume) {
        // User wants to resume - redirect to step 4 to process queue
        log('[SESSION] User chose to resume pending jobs\n');
        enableStep(4);
        await updateQueueStats();
        $('#collapseStep1').collapse('hide');
        $('#collapseStep4').collapse('show');
      }

      return true;

    } catch (testError) {
      log(`[SESSION] Stored token is invalid or expired: ${testError.message}\n`);
      clearSessionFromStorage();
      clearSession();
      return false;
    }

  } catch (e) {
    log(`[SESSION] Failed to restore session: ${e.message}\n`);
    clearSessionFromStorage();
    return false;
  }
}

/**
 * Load config from server (secure encrypted config)
 */
export async function loadConfig() {
  try {
    log('[CONFIG] Loading configuration from secure storage...\n');
    const response = await fetch('/api/config/load');
    if (response.ok) {
      const config = await response.json();
      if (config.fishbowl?.serverUrl) {
        // Store config globally for login to use
        window.APP_SECURE_CONFIG = config;
        log('[OK] Loaded encrypted credentials from DPAPI-protected storage\n');
      } else {
        log('[INFO] No configuration found - setup may be required\n');
      }
    } else {
      log('[INFO] No configuration found - setup may be required\n');
    }
  } catch (e) {
    log(`[INFO] Could not load config: ${e.message}\n`);
  }
}

/**
 * Save config to server
 */
export async function saveConfig(config) {
  try {
    await fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: config.serverUrl,
        username: config.username,
        password: config.password,
        database: config.database
      })
    });
    log('[CONFIG] Configuration saved for next session\n');
  } catch (e) {
    log(`[WARN] Could not save config: ${e.message}\n`);
  }
}

/**
 * Login to Fishbowl
 */
export async function login() {
  // Get credentials from secure config (loaded at startup)
  const config = window.APP_SECURE_CONFIG;

  if (!config || !config.fishbowl) {
    return alert('Configuration not loaded. Please check setup.');
  }

  const { serverUrl, username, password, database } = config.fishbowl;

  if (!serverUrl || !username || !password) {
    return alert('Incomplete configuration. Please check settings.');
  }

  const statusEl = document.getElementById('sessionStatus');
  statusEl.innerHTML = '<span class="text-info"><img src="images/spinner.svg" class="icon" alt="Loading"> Logging in...</span>';

  try {
    log('[LOGIN] Logging in to Fishbowl via proxy...\n');
    log(`[LOGIN] Server: ${serverUrl}, User: ${username}\n`);

    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: serverUrl,
        appName: APP_CONFIG.appName,
        appId: APP_CONFIG.appId,
        username: username,
        password: password,
        mfaCode: ''
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (!data.token) {
      throw new Error('Login succeeded but no token received');
    }

    setSessionToken(data.token);

    // Clear any previous job results on new login
    toggleDisplay('processResults', false);
    setHTML('processResultContent', '');
    log('[LOGIN] Cleared previous job results\n');

    statusEl.innerHTML = `<span class="text-success"><img src="images/check.svg" class="icon" alt="Success"> Logged in as ${username}</span>`;
    toggleDisplay('btnLogin', false);
    toggleDisplay('btnLogout', true);

    log(`[OK] Login successful! Token: ${data.token.substring(0, 20)}...\n`);

    log('[DB] Detecting database name via Fishbowl...\n');
    const databaseName = await detectDatabaseName();
    log(`[OK] Database detected: ${databaseName}\n`);

    // Store credentials including database
    const credentials = { username, password, database: databaseName };
    setSessionCredentials(credentials);

    // Save session to browser storage (now with database)
    saveSessionToStorage(data.token, credentials);

    await saveConfig({ serverUrl, username, password, database: databaseName });
    log('[CONFIG] Credentials and database name saved securely\n');

    await initializeQueueTable(databaseName);

    // Enable Step 1 now that we're logged in
    document.getElementById('step1').classList.remove('disabled');
    document.getElementById('step1').style.opacity = '1';
    document.getElementById('step1').style.pointerEvents = 'auto';
    $('#collapseStep1').collapse('show');
    log('[OK] Step 1 enabled - ready to configure work orders\n');

    // Import and call loadLocationGroups
    const { loadLocationGroups } = await import('./workOrderService.js');
    await loadLocationGroups();

    // Check for pending jobs from previous interrupted run
    log('[LOGIN] Checking for pending jobs from previous session...\n');
    const { checkForPendingJobs } = await import('./queueService.js');
    const shouldResume = await checkForPendingJobs();

    if (shouldResume) {
      // User wants to resume - redirect to step 4 to process queue
      log('[LOGIN] User chose to resume pending jobs\n');
      const { enableStep } = await import('../ui/stepManager.js');
      const { updateQueueStats } = await import('./queueService.js');
      enableStep(4);
      await updateQueueStats();
      $('#collapseStep1').collapse('hide');
      $('#collapseStep4').collapse('show');
    }

  } catch (e) {
    statusEl.innerHTML = '<span class="text-danger"><img src="images/x.svg" class="icon" alt="Error"> Login failed</span>';
    log(`[ERROR] Login failed: ${e.message}\n`);
    alert(`Login failed: ${e.message}\n\nMake sure:\n1. Node.js proxy server is running (node server.js)\n2. Fishbowl server URL is correct\n3. Username and password are valid`);
  }
}

/**
 * Logout from Fishbowl
 */
export async function logout(preserveResults = false) {
  const { sessionToken, sessionCredentials } = await import('../utils/state.js');
  const serverUrl = getServerUrl();

  if (!sessionToken) {
    return;
  }

  try {
    log('[LOGOUT] Logging out...\n');

    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: serverUrl,
        token: sessionToken,
        appName: APP_CONFIG.appName,
        appId: APP_CONFIG.appId,
        username: sessionCredentials.username,
        password: sessionCredentials.password
      })
    });

    log('[OK] Logged out successfully\n');

  } catch (e) {
    log(`[WARN] Logout error (non-critical): ${e.message}\n`);
  } finally {
    clearSession();

    // Clear session from storage
    clearSessionFromStorage();

    setHTML('sessionStatus', '<span class="text-muted">Not logged in</span>');
    toggleDisplay('btnLogin', true);
    setButtonEnabled('btnLogin', true);
    toggleDisplay('btnLogout', false);
    setButtonEnabled('btnLogout', true);

    // Reset entire page to initial state (optionally preserving results)
    const { resetPage } = await import('../ui/stepManager.js');
    resetPage(preserveResults);
  }
}

/**
 * Close job and logout
 */
export async function closeAndLogout() {
  log('\n[USER] Closing job and logging out...\n');

  // Clear the log for a fresh start
  document.getElementById('log').textContent = '';

  // Logout without preserving results (fresh start)
  await logout(false);

  log('='.repeat(60) + '\n');
  log('Manufacturing Orchestrator (Queue-Based)\n');
  log('='.repeat(60) + '\n');
  log('Ready for new session. Please login to continue.\n');
}

/**
 * Download failed items as CSV
 */
export function downloadFailedItemsCSV(results) {
  // Filter for failed items only
  const failedItems = results.filter(r => !r.status.includes('success'));

  if (failedItems.length === 0) {
    alert('No failed items to download.');
    return;
  }

  let csvContent = 'WO Number,Barcode,Serials Count,Error Message\n';

  failedItems.forEach(item => {
    const woNum = item.woNum || 'N/A';
    const barcode = item.barcode || 'N/A';
    const serials = item.serials || 0;
    const error = (item.error || 'Unknown error').replace(/"/g, '""'); // Escape quotes

    csvContent += `"${woNum}","${barcode}","${serials}","${error}"\n`;
  });

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `failed-items-${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  log(`[EXPORT] Downloaded ${failedItems.length} failed items to CSV\n`);
}
