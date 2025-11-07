/**
 * Authentication and session management service
 */

import { APP_CONFIG } from '../config.js';
import { log, setHTML, toggleDisplay, setButtonEnabled } from '../utils/helpers.js';
import { setSessionToken, setSessionCredentials, clearSession, getServerUrl } from '../utils/state.js';
import { detectDatabaseName } from '../api/fishbowlApi.js';
import { initializeQueueTable } from '../api/queueApi.js';

// Inactivity tracking
let inactivityTimer = null;
let inactivityTimeoutMs = 120000; // Default 2 minutes

/**
 * Reset inactivity timer
 */
function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }

  inactivityTimer = setTimeout(async () => {
    // Check if a job is running
    try {
      const response = await fetch('/api/queue-status');
      const status = await response.json();

      // Don't auto-logout if job is running
      if (status.status === 'running') {
        // Retry after 30 seconds
        resetInactivityTimer();
        return;
      }

      // Auto-logout
      log('[SESSION] Auto-logout due to inactivity\n');
      await logout();
    } catch (error) {
      console.error('Inactivity check error:', error);
    }
  }, inactivityTimeoutMs);
}

/**
 * Start tracking user activity
 */
function startActivityTracking() {
  // Event types that indicate activity
  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

  activityEvents.forEach(eventType => {
    document.addEventListener(eventType, resetInactivityTimer, { passive: true });
  });

  // Start initial timer
  resetInactivityTimer();
}

/**
 * Stop tracking user activity
 */
function stopActivityTracking() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  // Note: We don't remove event listeners as they just call resetInactivityTimer
  // which checks if timer exists
}

/**
 * Load inactivity timeout from server
 */
async function loadInactivityTimeout() {
  try {
    const response = await fetch('/api/ui-session-status');
    const data = await response.json();
    if (data.inactivityTimeoutMs > 0) {
      inactivityTimeoutMs = data.inactivityTimeoutMs;
      log(`[SESSION] Inactivity timeout set to ${inactivityTimeoutMs / 1000} seconds\n`);
    }
  } catch (error) {
    console.error('Failed to load inactivity timeout:', error);
  }
}

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
    // Restore session variables (no password - it's in secure server-side config)
    setSessionToken(storedSession.token);
    setSessionCredentials({
      username: storedSession.username,
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

      // Note: serverUrl, username, password fields don't exist - managed in backend secure config

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
        // Don't send password - backend will keep existing password from secure config
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

    // Stop polling for job status (we're now logged in)
    const { stopLoginPageJobPolling } = await import('./queueService.js');
    stopLoginPageJobPolling();

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

    // Store credentials including database (no password - it's in secure server-side config)
    const credentials = { username, database: databaseName };
    setSessionCredentials(credentials);

    // Save session to browser storage (now with database, no password)
    saveSessionToStorage(data.token, credentials);

    // Save config (no password - backend will keep existing password from secure config)
    await saveConfig({ serverUrl, username, database: databaseName });
    log('[CONFIG] Database name saved securely\n');

    // Load inactivity timeout and start tracking
    await loadInactivityTimeout();
    startActivityTracking();

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

    // Check for scheduled and failed jobs
    await checkScheduledAndFailedJobs();

  } catch (e) {
    statusEl.innerHTML = '<span class="text-danger"><img src="images/x.svg" class="icon" alt="Error"> Login failed</span>';
    log(`[ERROR] Login failed: ${e.message}\n`);
    alert(`Login failed: ${e.message}\n\nMake sure:\n1. Node.js proxy server is running (node server.js)\n2. Fishbowl server URL is correct\n3. Username and password are valid`);
  }
}

/**
 * Check for scheduled and failed jobs on login
 */
async function checkScheduledAndFailedJobs() {
  try {
    log('[LOGIN] Checking for scheduled and failed jobs...\n');

    // Fetch scheduled jobs
    const scheduledResponse = await fetch('/api/mysql/scheduled-jobs');
    const scheduledData = await scheduledResponse.json();

    // Fetch failed jobs
    const failedResponse = await fetch('/api/mysql/failed-jobs');
    const failedData = await failedResponse.json();

    const scheduledJobs = scheduledData.jobs || [];
    const failedJobs = failedData.jobs || [];

    if (scheduledJobs.length === 0 && failedJobs.length === 0) {
      log('[LOGIN] No scheduled or failed jobs found\n');
      return;
    }

    // Build the notification message
    let message = '';

    if (scheduledJobs.length > 0) {
      message += `📅 SCHEDULED JOBS:\n\n`;
      scheduledJobs.forEach(job => {
        // MySQL returns datetime in local timezone (matches server timezone)
        const scheduledFor = new Date(job.scheduled_for).toLocaleString();
        message += `  • ${job.count} job(s) scheduled for ${scheduledFor}\n`;
      });
      message += '\n';
    }

    if (failedJobs.length > 0) {
      message += `❌ FAILED JOBS:\n\n`;
      const displayCount = Math.min(failedJobs.length, 5);
      for (let i = 0; i < displayCount; i++) {
        const job = failedJobs[i];
        const barcode = job.barcode || 'N/A';
        const error = (job.error_message || 'Unknown error').substring(0, 50);
        message += `  • ${barcode}: ${error}...\n`;
      }
      if (failedJobs.length > 5) {
        message += `  ... and ${failedJobs.length - 5} more\n`;
      }
      message += '\n';
    }

    message += 'Would you like to manage these jobs now?';

    log(`[LOGIN] Found ${scheduledJobs.length} scheduled job group(s) and ${failedJobs.length} failed job(s)\n`);

    // Show confirmation dialog
    if (confirm(message)) {
      showScheduledJobsManager(scheduledJobs, failedJobs);
    }

  } catch (error) {
    log(`[ERROR] Failed to check scheduled/failed jobs: ${error.message}\n`);
    // Don't block login if this fails
  }
}

/**
 * Show scheduled jobs management UI
 */
function showScheduledJobsManager(scheduledJobs, failedJobs) {
  // Create modal HTML
  const modalHtml = `
    <div class="modal fade" id="jobManagerModal" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <button type="button" class="close" data-dismiss="modal">&times;</button>
            <h4 class="modal-title">Manage Scheduled & Failed Jobs</h4>
          </div>
          <div class="modal-body">
            ${scheduledJobs.length > 0 ? `
              <h5>📅 Scheduled Jobs</h5>
              <div class="table-responsive">
                <table class="table table-striped">
                  <thead>
                    <tr>
                      <th>Scheduled For</th>
                      <th>Job Count</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${scheduledJobs.map((job, index) => `
                      <tr>
                        <td>${new Date(job.scheduled_for).toLocaleString()}</td>
                        <td>${job.count} item(s)</td>
                        <td><button class="btn btn-sm btn-danger delete-scheduled" data-scheduled-index="${index}">Delete</button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            ${failedJobs.length > 0 ? `
              <h5 style="margin-top: 20px;">❌ Failed Jobs</h5>
              <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                <table class="table table-striped">
                  <thead>
                    <tr>
                      <th>Barcode</th>
                      <th>WO Number</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${failedJobs.map(job => `
                      <tr>
                        <td>${job.barcode || 'N/A'}</td>
                        <td>${job.wo_number || 'N/A'}</td>
                        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${job.error_message || 'Unknown error'}">${(job.error_message || 'Unknown error').substring(0, 50)}...</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <button class="btn btn-warning btn-block" id="btnClearAllFailed">Clear All Failed Jobs</button>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  $('#jobManagerModal').remove();

  // Add modal to page
  $('body').append(modalHtml);

  // Setup event handlers
  $('.delete-scheduled').on('click', async function() {
    const index = $(this).data('scheduled-index');
    const job = scheduledJobs[index];
    if (job && confirm(`Delete all jobs scheduled for ${new Date(job.scheduled_for).toLocaleString()}?`)) {
      await deleteScheduledJobs(job.scheduled_for);
    }
  });

  $('#btnClearAllFailed').on('click', async function() {
    if (confirm(`Clear all ${failedJobs.length} failed job(s)?`)) {
      await clearFailedJobs();
    }
  });

  // Show modal
  $('#jobManagerModal').modal('show');
}

/**
 * Delete scheduled jobs by scheduled_for time
 */
async function deleteScheduledJobs(scheduledFor) {
  try {
    const response = await fetch('/api/mysql/scheduled-jobs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledFor: scheduledFor })
    });

    const result = await response.json();

    if (result.success) {
      alert(`Successfully deleted ${result.deletedCount} scheduled job(s)`);

      // Check if there are any remaining jobs
      const scheduledResponse = await fetch('/api/mysql/scheduled-jobs');
      const scheduledData = await scheduledResponse.json();
      const failedResponse = await fetch('/api/mysql/failed-jobs');
      const failedData = await failedResponse.json();

      const scheduledJobs = scheduledData.jobs || [];
      const failedJobs = failedData.jobs || [];

      // If no jobs remaining, close modal completely
      if (scheduledJobs.length === 0 && failedJobs.length === 0) {
        $('#jobManagerModal').modal('hide');
        // Remove modal and backdrop completely to prevent overlay issues
        setTimeout(() => {
          $('#jobManagerModal').remove();
          $('.modal-backdrop').remove();
          $('body').removeClass('modal-open');
        }, 500);
      } else {
        // Refresh the modal with remaining jobs
        $('#jobManagerModal').modal('hide');
        showScheduledJobsManager(scheduledJobs, failedJobs);
      }
    } else {
      alert('Failed to delete scheduled jobs');
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

/**
 * Clear all failed jobs
 */
async function clearFailedJobs() {
  try {
    const response = await fetch('/api/mysql/failed-jobs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const result = await response.json();

    if (result.success) {
      alert(`Successfully cleared ${result.clearedCount} failed job(s)`);

      // Check if there are any remaining jobs
      const scheduledResponse = await fetch('/api/mysql/scheduled-jobs');
      const scheduledData = await scheduledResponse.json();
      const failedResponse = await fetch('/api/mysql/failed-jobs');
      const failedData = await failedResponse.json();

      const scheduledJobs = scheduledData.jobs || [];
      const failedJobs = failedData.jobs || [];

      // If no jobs remaining, close modal completely
      if (scheduledJobs.length === 0 && failedJobs.length === 0) {
        $('#jobManagerModal').modal('hide');
        // Remove modal and backdrop completely to prevent overlay issues
        setTimeout(() => {
          $('#jobManagerModal').remove();
          $('.modal-backdrop').remove();
          $('body').removeClass('modal-open');
        }, 500);
      } else {
        // Refresh the modal with remaining jobs
        $('#jobManagerModal').modal('hide');
        showScheduledJobsManager(scheduledJobs, failedJobs);
      }
    } else {
      alert('Failed to clear failed jobs');
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
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

    // Stop activity tracking
    stopActivityTracking();

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

    // Restart polling for job status (now logged out)
    const { startLoginPageJobPolling } = await import('./queueService.js');
    startLoginPageJobPolling();
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

/**
 * Export all results as CSV
 */
export function exportAllResultsCSV(results) {
  if (!results || results.length === 0) {
    alert('No results to export.');
    return;
  }

  let csvContent = 'WO Number,Barcode,Operation Type,Status,Serials/Output,Error Message\n';

  results.forEach(item => {
    const woNum = item.woNum || 'N/A';
    const barcode = item.barcode || 'N/A';
    const operationType = item.operationType || 'N/A';
    const status = item.status || 'N/A';
    const serialsOrOutput = item.operationType === 'disassemble' ? 'DISASSEMBLE' : (item.serials || 0);
    const error = (item.error || '').replace(/"/g, '""'); // Escape quotes

    csvContent += `"${woNum}","${barcode}","${operationType}","${status}","${serialsOrOutput}","${error}"\n`;
  });

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `all-results-${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  log(`[EXPORT] Downloaded ${results.length} results to CSV\n`);
}
