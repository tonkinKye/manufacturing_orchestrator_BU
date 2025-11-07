/**
 * Queue Processing Service
 * Handles all queue processing, job status polling, and job resumption logic
 */

import { log } from '../utils/helpers.js';
import { state, sessionToken, sessionCredentials, getServerUrl, setPollInterval, clearPollInterval } from '../utils/state.js';
import { getQueueStats } from '../api/queueApi.js';
import { closeAndLogout, downloadFailedItemsCSV, exportAllResultsCSV } from './authService.js';

// Local reference to poll interval
let pollInterval = null;
let connectionLost = false;
let reconnectAttempts = 0;

/**
 * Update queue statistics display
 */
export async function updateQueueStats() {
  try {
    const stats = await getQueueStats();

    const statsHtml = `
      <strong class="text-warning">${stats.pending > 0 ? 'Pending' : 'Idle'}</strong><br>
      WO's to Process: <strong>${stats.pending}</strong>
    `;

    document.getElementById('queueStatsContent').innerHTML = statsHtml;
  } catch (e) {
    document.getElementById('queueStatsContent').innerHTML = `<span class="text-danger">Error loading stats: ${e.message}</span>`;
  }
}

/**
 * Main queue processing function
 * Starts or resumes queue processing
 */
export async function processQueue() {
  try {
    log(`\n${'='.repeat(60)}\nSTARTING QUEUE PROCESSING\n${'='.repeat(60)}\n`);

    const configResponse = await fetch('/api/load-config');
    const config = await configResponse.json();

    const database = config.fishbowl?.database || config.database;
    if (!database) {
      throw new Error('Database not configured. Please login first.');
    }

    // Check if we're resuming a job (get BOM/location from queue) or starting fresh
    let bomNum, bomId, locationGroupId;

    if (state.bom && state.bomId && state.locationGroup) {
      // Starting a new job
      bomNum = state.bom;
      bomId = state.bomId;
      locationGroupId = state.locationGroup;
      log(`[NEW JOB] Using BOM: ${bomNum}, Location Group: ${locationGroupId}\n`);
    } else {
      // Resuming an interrupted job - get BOM/location from first pending item
      log(`[RESUME] Getting BOM and location group from pending items...\n`);

      const infoResponse = await fetch('/api/get-pending-job-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: database })
      });

      if (!infoResponse.ok) {
        const errorData = await infoResponse.json();
        throw new Error(errorData.error || 'Failed to get pending job info');
      }

      const infoData = await infoResponse.json();
      bomNum = infoData.bomNum;
      bomId = infoData.bomId;
      locationGroupId = infoData.locationGroupId;

      log(`[RESUME] Retrieved from queue - BOM: ${bomNum}, BOM ID: ${bomId}, Location Group: ${locationGroupId}\n`);
    }

    log(`[SERVER] Starting server-side processing...\n`);

    // Hide queue stats during processing (will show at completion)
    document.getElementById('queueStats').style.display = 'none';

    const startResponse = await fetch('/api/start-queue-processing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sessionToken,
        bom: bomNum,
        bomId: bomId,
        locationGroup: locationGroupId
      })
    });

    if (!startResponse.ok) {
      const errorData = await startResponse.json();
      throw new Error(errorData.error || 'Failed to start processing');
    }

    const startData = await startResponse.json();
    log(`[OK] Server accepted job: ${startData.jobId}\n`);
    log(`[INFO] Processing in background - you can close this browser\n`);

    // === IMMEDIATELY SHOW "JOB RUNNING" UI STATE ===

    // Show banner
    const bannerEl = document.getElementById('reconnectBanner');
    bannerEl.innerHTML = `
      <strong><img src="images/rocket.svg" class="icon" alt="Launch"> Processing Job Started</strong><br>
      Job is running on the server. You can safely close this browser - progress is saved to the database.
    `;
    bannerEl.style.background = '#fff3cd';
    bannerEl.style.borderLeft = '4px solid #ffc107';
    bannerEl.style.display = 'block';

    // Grey out and disable login panel
    const configPanel = document.querySelector('.config-panel');
    configPanel.style.opacity = '0.6';
    configPanel.style.pointerEvents = 'none';

    // Disable login buttons (serverUrl, username, password fields don't exist - managed in backend)
    document.getElementById('btnLogin').disabled = true;
    document.getElementById('btnLogout').disabled = true;

    // Grey out and disable configuration steps
    document.getElementById('step1').style.opacity = '0.6';
    document.getElementById('step1').style.pointerEvents = 'none';
    document.getElementById('step1_5').style.opacity = '0.6';
    document.getElementById('step1_5').style.pointerEvents = 'none';
    document.getElementById('step2').style.opacity = '0.6';
    document.getElementById('step2').style.pointerEvents = 'none';
    document.getElementById('step2b').style.opacity = '0.6';
    document.getElementById('step2b').style.pointerEvents = 'none';
    document.getElementById('step3').style.opacity = '0.6';
    document.getElementById('step3').style.pointerEvents = 'none';

    // Disable the Process Queue button
    document.getElementById('btnProcess').disabled = true;
    document.getElementById('btnProcess').textContent = 'Job Already Running';
    document.getElementById('btnProcess').classList.remove('btn-warning');
    document.getElementById('btnProcess').classList.add('btn-default');

    // Collapse other steps
    $('#collapseStep1').collapse('hide');
    $('#collapseStep1_5').collapse('hide');
    $('#collapseStep2').collapse('hide');
    $('#collapseStep2b').collapse('hide');
    $('#collapseStep3').collapse('hide');

    // === END UI STATE CHANGES ===

    document.getElementById('processResults').style.display = 'block';
    document.getElementById('processResultContent').innerHTML = `
      <div class="alert alert-info">
        <h4><img src="images/rocket.svg" class="icon" alt="Launch"> Processing in Background...</h4>
        <p><strong>Status:</strong> <span id="statusText">Starting...</span></p>
        <p><strong>Progress:</strong> <span id="progressText">0 / 0</span></p>
        <p><strong>Time Elapsed:</strong> <span id="timeElapsed">0s</span></p>
        <p><strong>Estimated Time Remaining:</strong> <span id="timeRemaining">Calculating...</span></p>
        <p><strong>Current MO:</strong> <span id="currentMO">-</span></p>
        <p><strong>Current WO:</strong> <span id="currentWO">-</span></p>
        <div class="progress" style="margin-top:10px;">
          <div id="progressBar" class="progress-bar progress-bar-striped active" style="width: 0%">
            <span id="progressPercent">0%</span>
          </div>
        </div>
        <div style="margin-top:15px;">
          <button id="btnStopJob" class="btn btn-warning btn-sm"><img src="images/x.svg" class="icon" alt="Stop"> Stop Job</button>
        </div>
        <p style="margin-top:10px;"><small><img src="images/lightbulb.svg" class="icon" alt="Tip"> This page can be closed - processing continues on server</small></p>
      </div>
      <div id="resultsContainer"></div>`;

    // Wire up stop button
    document.getElementById('btnStopJob').addEventListener('click', stopJob);

    pollQueueStatus();

  } catch (e) {
    log(`[ERROR] Failed to start processing: ${e.message}\n`);
    alert(`Error: ${e.message}`);
  }
}

/**
 * Stop the current job
 */
export async function stopJob() {
  try {
    log('[STOP] Requesting job stop...\n');

    const response = await fetch('/api/stop-queue-processing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to stop job');
    }

    log('[STOP] Stop requested - job will pause after current item completes\n');

  } catch (e) {
    log(`[ERROR] Error stopping job: ${e.message}\n`);
    alert(`Error stopping job: ${e.message}`);
  }
}

/**
 * Resume a stopped job
 */
export async function resumeJob() {
  try {
    log('[RESUME] Resuming job...\n');

    // Just call processQueue - it will pick up where we left off
    await processQueue();

  } catch (e) {
    log(`[ERROR] Error resuming job: ${e.message}\n`);
    alert(`Error resuming job: ${e.message}`);
  }
}

/**
 * Clear job and reset
 */
export async function clearJob() {
  const confirm = window.confirm(
    '⚠️ CLEAR JOB\n\n' +
    'This will:\n' +
    '• Close short any incomplete MOs in Fishbowl\n' +
    '• Delete all pending records from the queue\n' +
    '• Log you out and reset the page\n\n' +
    'Are you sure you want to continue?'
  );

  if (!confirm) {
    log('[CLEAR] User cancelled clear operation\n');
    return;
  }

  try {
    log('[CLEAR] Clearing job and closing short MOs...\n');

    const response = await fetch('/api/clear-pending-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sessionToken
      })
    });

    if (!response.ok) {
      throw new Error('Failed to clear job');
    }

    const result = await response.json();

    log(`[CLEAR] Successfully closed short ${result.closedShortCount} MO(s)\n`);
    log(`[CLEAR] Deleted ${result.deletedCount} queue record(s)\n`);

    if (result.failedMOs && result.failedMOs.length > 0) {
      log(`[WARN] Failed to close short ${result.failedMOs.length} MO(s):\n`);
      result.failedMOs.forEach(mo => {
        log(`  - ${mo.moNum}: ${mo.error}\n`);
      });
    }

    alert(
      `✓ Clear Complete\n\n` +
      `Closed short: ${result.closedShortCount} MO(s)\n` +
      `Deleted: ${result.deletedCount} record(s)\n` +
      (result.failedMOs.length > 0 ? `\n⚠ Failed: ${result.failedMOs.length} MO(s) (see log)` : '') +
      `\n\nLogging out and resetting page...`
    );

    // Logout and reset
    await closeAndLogout();

  } catch (e) {
    log(`[ERROR] Error clearing job: ${e.message}\n`);
    alert(`Error clearing job: ${e.message}`);
  }
}

/**
 * Poll queue status for job updates
 */
export async function pollQueueStatus() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollInterval = setInterval(async () => {
    try {
      const statusResponse = await fetch('/api/queue-status');

      // Check if the request failed (service down)
      if (!statusResponse.ok) {
        throw new Error(`HTTP ${statusResponse.status}`);
      }

      const status = await statusResponse.json();

      // Connection successful - clear any reconnection state
      if (connectionLost) {
        log(`\n[RECONNECT] Connection restored! Service is back online.\n`);
        log(`[RECONNECT] Job status: ${status.status}\n`);

        // Update banner to show successful reconnection
        const banner = document.getElementById('jobReconnectBanner');
        if (banner) {
          banner.innerHTML = `
            <strong><img src="images/check.svg" class="icon" alt="Success"> Connection Restored</strong><br>
            Service is back online. Resuming job automatically...
          `;
          banner.style.background = '#d4edda';
          banner.style.borderLeft = '4px solid #28a745';

          // Auto-hide success banner after 3 seconds
          setTimeout(() => {
            banner.style.display = 'none';
          }, 3000);
        }

        connectionLost = false;
        reconnectAttempts = 0;

        // Check if we need to resume the job
        // If service restarted, status will be 'idle' but there may be pending items
        if (status.status === 'idle' && status.totalItems === 0) {
          // Service restarted and no job is running - check for pending items
          log(`[RECONNECT] Service restarted with no active job. Checking for pending work...\n`);

          // Stop polling temporarily
          clearInterval(pollInterval);

          // Check for pending jobs and auto-resume
          setTimeout(async () => {
            try {
              const configResponse = await fetch('/api/load-config');
              const config = await configResponse.json();
              const database = config.fishbowl?.database || config.database;

              if (database) {
                const checkResponse = await fetch('/api/check-pending-jobs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ database: database })
                });

                const result = await checkResponse.json();

                if (result.hasPendingJobs) {
                  log(`[AUTO-RESUME] Found ${result.pendingCount} pending item(s). Resuming automatically...\n`);

                  // Auto-resume the job
                  await processQueue();
                } else {
                  log(`[RECONNECT] No pending items found. Job completed during restart.\n`);
                }
              }
            } catch (error) {
              log(`[ERROR] Failed to check for pending jobs: ${error.message}\n`);
              // Restart polling even if check fails
              pollQueueStatus();
            }
          }, 100);
        } else if (status.status === 'running') {
          log(`[RECONNECT] Job is still running. Continuing to monitor...\n`);
        } else if (status.status === 'stopped') {
          log(`[RECONNECT] Job was stopped. Waiting for user action.\n`);
        }
      }

      document.getElementById('statusText').textContent = status.status.toUpperCase();
      document.getElementById('progressText').textContent = `${status.processedItems} / ${status.totalItems}`;
      document.getElementById('currentMO').textContent = status.currentMO || '-';
      document.getElementById('currentWO').textContent = status.currentWO || '-';

      const progress = status.totalItems > 0 ? Math.round((status.processedItems / status.totalItems) * 100) : 0;
      document.getElementById('progressBar').style.width = `${progress}%`;
      document.getElementById('progressPercent').textContent = `${progress}%`;

      // Calculate and display elapsed time
      if (status.startTime) {
        const startTime = new Date(status.startTime);
        const now = new Date();
        const elapsedMs = now - startTime;
        document.getElementById('timeElapsed').textContent = formatDuration(elapsedMs);

        // Calculate and display ETA (only after at least 3 items are processed)
        if (status.processedItems >= 3 && status.totalItems > status.processedItems) {
          const avgTimePerItem = elapsedMs / status.processedItems;
          const remainingItems = status.totalItems - status.processedItems;
          const estimatedRemainingMs = avgTimePerItem * remainingItems;
          document.getElementById('timeRemaining').textContent = formatDuration(estimatedRemainingMs);
        } else if (status.processedItems > 0 && status.totalItems > status.processedItems) {
          document.getElementById('timeRemaining').textContent = 'Calculating...';
        } else if (status.totalItems === status.processedItems) {
          document.getElementById('timeRemaining').textContent = '0s';
        }
      }

      // DEBUG: Log all status checks
      console.log('[DEBUG] Polling status:', status.status, 'Stop requested:', status.stopRequested);

      if (status.status === 'stopped') {
        clearInterval(pollInterval);
        document.getElementById('progressBar').classList.remove('active');

        log(`\n${'='.repeat(60)}\nJOB STOPPED\n${'='.repeat(60)}\n`);
        log(`Progress: ${status.processedItems}/${status.totalItems}\n`);
        log(`Success: ${status.successItems}\n`);
        log(`Failed: ${status.failedItems}\n`);
        log(`Remaining: ${status.totalItems - status.processedItems}\n`);

        const stoppedHtml = `
          <div class="alert alert-warning">
            <h4><img src="images/x.svg" class="icon" alt="Stopped"> Job Stopped</h4>
            <hr>
            <p><strong>Total Items:</strong> ${status.totalItems}</p>
            <p><strong>Processed:</strong> ${status.processedItems}</p>
            <p><strong>Remaining:</strong> ${status.totalItems - status.processedItems}</p>
            <p><strong>Successful:</strong> <span class="text-success">${status.successItems}</span></p>
            <p><strong>Failed:</strong> <span class="text-danger">${status.failedItems}</span></p>
          </div>
          <div class="alert alert-info">
            <h5><img src="images/info.svg" class="icon" alt="Info"> What would you like to do?</h5>
            <p><strong>Resume:</strong> Continue processing the remaining ${status.totalItems - status.processedItems} item(s)</p>
            <p><strong>Clear:</strong> Close short incomplete MOs, delete queue records, logout and reset</p>
          </div>
          <div style="margin-top:15px;">
            <button id="btnResumeJob" class="btn btn-success btn-lg btn-block" style="margin-bottom:10px;">
              <img src="images/play.svg" class="icon" alt="Resume"> Resume Job
            </button>
            <button id="btnClearJob" class="btn btn-danger btn-lg btn-block">
              <img src="images/x.svg" class="icon" alt="Clear"> Clear Job & Logout
            </button>
          </div>
        `;

        document.getElementById('processResultContent').innerHTML = stoppedHtml;

        // Wire up buttons
        document.getElementById('btnResumeJob').addEventListener('click', resumeJob);
        document.getElementById('btnClearJob').addEventListener('click', clearJob);

        log('[JOB] Job stopped - waiting for user action (Resume or Clear)\n');

      } else if (status.status === 'completed' || status.status === 'error') {
        clearInterval(pollInterval);
        document.getElementById('progressBar').classList.remove('active');

        log(`\n${'='.repeat(60)}\nPROCESSING COMPLETE\n${'='.repeat(60)}\n`);
        log(`Status: ${status.status}\n`);
        log(`Total: ${status.totalItems}\n`);
        log(`Success: ${status.successItems}\n`);
        log(`Failed: ${status.failedItems}\n`);

        const finalHtml = `
          <div class="alert ${status.status === 'completed' ? 'alert-success' : 'alert-danger'}">
            <h4>${status.status === 'completed' ? '<img src="images/check.svg" class="icon" alt="Success"> Processing Complete!' : '<img src="images/x.svg" class="icon" alt="Error"> Processing Failed'}</h4>
            <hr>
            <p><strong>Total Items:</strong> ${status.totalItems}</p>
            <p><strong>Successful:</strong> <span class="text-success">${status.successItems}</span></p>
            <p><strong>Failed:</strong> <span class="text-danger">${status.failedItems}</span></p>
            ${status.error ? `<p><strong>Error:</strong> ${status.error}</p>` : ''}
            <p><strong>Duration:</strong> ${calculateDuration(status.startTime, status.endTime)}</p>
          </div>

          <div style="margin-top:15px;">
            <div class="panel panel-default">
              <div class="panel-heading" style="cursor: pointer; background-color: #f5f5f5;" id="resultsToggle">
                <h5 style="margin: 0; display: flex; justify-content: space-between; align-items: center;">
                  <span><img src="images/clipboard.svg" class="icon" alt="Results"> Detailed Results (${status.results.length})</span>
                  <span id="resultsToggleIcon" style="font-size: 20px;">▼</span>
                </h5>
              </div>
              <div class="panel-body" id="resultsPanel" style="display: none; max-height: 500px; overflow-y: auto; padding: 10px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 10px;">
                  ${status.results.map(r => {
                    const isSuccess = r.status.includes('success');
                    const operationIcon = r.operationType === 'disassemble' ? '⚙️' : '🏗️';
                    const operationLabel = r.operationType === 'disassemble' ? 'DISASSEMBLE' : 'BUILD';
                    const serialsText = r.operationType === 'disassemble' ? operationLabel : `${r.serials || 0} serials`;

                    return `
                      <div style="border: 1px solid ${isSuccess ? '#28a745' : '#dc3545'}; border-radius: 4px; padding: 10px; background-color: ${isSuccess ? '#f0fff0' : '#fff5f5'};">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                          ${isSuccess ? '<img src="images/check.svg" class="icon" alt="Success" style="color: #28a745;">' : '<img src="images/x.svg" class="icon" alt="Error" style="color: #dc3545;">'}
                          <strong style="color: ${isSuccess ? '#28a745' : '#dc3545'};">${r.woNum}</strong>
                          <span style="background: ${r.operationType === 'disassemble' ? '#ff9800' : '#2196f3'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">${operationIcon} ${operationLabel}</span>
                        </div>
                        <div style="font-size: 13px; color: #666;">
                          <div><strong>Barcode:</strong> ${r.barcode}</div>
                          <div><strong>Output:</strong> ${serialsText}</div>
                          ${r.status === 'success-retry' ? '<div style="color: #ff9800;"><strong>Status:</strong> Success (retry)</div>' : ''}
                          ${r.error ? `<div style="color: #dc3545; margin-top: 5px;"><strong>Error:</strong> ${r.error}</div>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="alert alert-info" style="margin-top:20px;">
            <strong><img src="images/check.svg" class="icon" alt="Complete"> Job Complete</strong><br>
            Review the results above. When ready, export or close to start a new job.
          </div>
          <div style="margin-top:15px;">
            <button id="btnExportAllResults" class="btn btn-info btn-lg btn-block" style="margin-bottom:10px;">
              <img src="images/save.svg" class="icon" alt="Export"> Export All Results (CSV)
            </button>
            ${status.failedItems > 0 ? `
            <button id="btnDownloadFailed" class="btn btn-warning btn-lg btn-block" style="margin-bottom:10px;">
              <img src="images/save.svg" class="icon" alt="Download"> Export Failed Items Only (CSV)
            </button>
            ` : ''}
            <button id="btnCloseAndLogout" class="btn btn-primary btn-lg btn-block">
              <img src="images/door.svg" class="icon" alt="Logout"> Close & Log Out
            </button>
          </div>
        `;

        document.getElementById('processResultContent').innerHTML = finalHtml;

        // Wire up the results toggle
        document.getElementById('resultsToggle').addEventListener('click', () => {
          const panel = document.getElementById('resultsPanel');
          const icon = document.getElementById('resultsToggleIcon');
          if (panel.style.display === 'none') {
            panel.style.display = 'block';
            icon.textContent = '▲';
          } else {
            panel.style.display = 'none';
            icon.textContent = '▼';
          }
        });

        // Wire up the Export All Results button
        document.getElementById('btnExportAllResults').addEventListener('click', () => {
          exportAllResultsCSV(status.results);
        });

        // Wire up the Download Failed Items button (if it exists)
        if (status.failedItems > 0) {
          document.getElementById('btnDownloadFailed').addEventListener('click', () => {
            downloadFailedItemsCSV(status.results);
          });
        }

        // Wire up the Close & Log Out button
        document.getElementById('btnCloseAndLogout').addEventListener('click', () => {
          log('[USER] Close & Log Out clicked\n');
          closeAndLogout();
        });

        // Show queue stats now that job is complete
        document.getElementById('queueStats').style.display = 'block';
        await updateQueueStats();

        log('[JOB] Processing complete - waiting for user to close\n');
      }


    } catch (e) {
      // Connection failed - service is likely restarting
      if (!connectionLost) {
        connectionLost = true;
        reconnectAttempts = 0;

        log(`\n[CONNECTION LOST] Cannot reach server - service may be restarting\n`);
        log(`[INFO] Will keep trying to reconnect automatically...\n`);

        // Show reconnection banner (in the job progress area where user is looking)
        const banner = document.getElementById('jobReconnectBanner');
        if (banner) {
          banner.innerHTML = `
            <strong><img src="images/warning.svg" class="icon" alt="Warning"> Connection Lost</strong><br>
            The background service is restarting. Attempting to reconnect automatically...
          `;
          banner.style.background = '#fff3cd';
          banner.style.borderLeft = '4px solid #ffc107';
          banner.style.display = 'block';
        }
      }

      reconnectAttempts++;
      console.log(`[RECONNECT] Attempt ${reconnectAttempts} - waiting for service...`);

      // Update banner with attempt count after a few tries
      const banner = document.getElementById('jobReconnectBanner');
      if (banner && reconnectAttempts > 3) {
        banner.innerHTML = `
          <strong><img src="images/warning.svg" class="icon" alt="Warning"> Connection Lost</strong><br>
          The background service is restarting. Attempting to reconnect... (attempt ${reconnectAttempts})
        `;
      }
    }
  }, 2000);
}

/**
 * Check for pending jobs on page load
 */
export async function checkForPendingJobs() {
  try {
    const configResponse = await fetch('/api/load-config');
    const config = await configResponse.json();

    const database = config.fishbowl?.database || config.database;
    if (!database) {
      return false;
    }

    const response = await fetch('/api/check-pending-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: database })
    });

    if (!response.ok) {
      throw new Error('Failed to check for pending jobs');
    }

    const result = await response.json();

    if (result.hasPendingJobs) {
      log(`[PENDING JOBS] Found ${result.pendingCount} pending item(s) in queue\n`);
      return await handlePendingJobs(result.pendingCount, database);
    }

    return false;

  } catch (error) {
    log(`[ERROR] Error checking for pending jobs: ${error.message}\n`);
    return false;
  }
}

/**
 * Handle user choice for pending jobs (resume or close short)
 */
async function handlePendingJobs(pendingCount, database) {
  const resume = confirm(
    `⚠️ PENDING JOBS DETECTED\n\n` +
    `There are ${pendingCount} pending work order(s) in the queue from a previous interrupted job.\n\n` +
    `Would you like to resume processing these items?\n\n` +
    `• Click OK to RESUME the job\n` +
    `• Click Cancel to CLOSE SHORT the MOs and mark items as closed`
  );

  if (resume) {
    log('[USER] User chose to RESUME pending job\n');
    return true; // Will trigger job resumption
  } else {
    log('[USER] User chose to CLOSE SHORT pending job\n');
    await closeShortPendingJobs(database);
    return false;
  }
}

/**
 * Close short pending jobs
 */
async function closeShortPendingJobs(database) {
  try {
    log('[CLOSE SHORT] Starting close short process...\n');

    if (!sessionToken) {
      throw new Error('Not logged in');
    }

    const response = await fetch('/api/close-short-pending-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sessionToken
      })
    });

    if (!response.ok) {
      throw new Error('Failed to close short pending jobs');
    }

    const result = await response.json();

    log(`[CLOSE SHORT] Successfully closed short ${result.closedShortCount} MO(s)\n`);
    log(`[CLOSE SHORT] Marked ${result.markedCount} queue item(s) as closed_short\n`);

    if (result.failedMOs && result.failedMOs.length > 0) {
      log(`[WARN] Failed to close short ${result.failedMOs.length} MO(s):\n`);
      result.failedMOs.forEach(mo => {
        log(`  - ${mo.moNum}: ${mo.error}\n`);
      });
    }

    alert(
      `✓ Close Short Complete\n\n` +
      `Closed short: ${result.closedShortCount} MO(s)\n` +
      `Marked as closed_short: ${result.markedCount} queue item(s)\n` +
      (result.failedMOs.length > 0 ? `\n⚠ Failed: ${result.failedMOs.length} MO(s) (see log)` : '')
    );

  } catch (error) {
    log(`[ERROR] Error closing short: ${error.message}\n`);
    alert(`Error closing short pending jobs:\n\n${error.message}`);
  }
}

/**
 * Check and resume active job on page load
 */
export async function checkAndResumeJob() {
  try {
    log('[RESUME] Checking for active jobs on server...\n');

    const statusResponse = await fetch('/api/queue-status');
    const status = await statusResponse.json();

    if (status.status === 'running') {
      log('\n' + '='.repeat(60) + '\n');
      log('<img src="images/lightning.svg" class="icon" alt="Fast"> RECONNECTED TO ACTIVE JOB\n');
      log('='.repeat(60) + '\n');
      log(`Progress: ${status.processedItems}/${status.totalItems}\n`);
      log(`Current MO: ${status.currentMO || 'N/A'}\n`);
      log(`Current WO: ${status.currentWO || 'N/A'}\n`);
      log('Resuming live monitoring...\n\n');

      // Show reconnection banner
      document.getElementById('reconnectBanner').style.display = 'block';

      // Grey out and disable login panel
      const configPanel = document.querySelector('.config-panel');
      configPanel.style.opacity = '0.6';
      configPanel.style.pointerEvents = 'none';

      // Disable login button (serverUrl, username, password fields don't exist - managed in backend)
      document.getElementById('btnLogin').disabled = true;

      // Show logged in status with restored session
      const username = sessionCredentials.username || 'Previous Session';
      document.getElementById('sessionStatus').innerHTML = `<span class="text-success"><img src="images/check.svg" class="icon" alt="Success"> Session restored (${username})</span>`;
      document.getElementById('btnLogout').style.display = 'inline-block';

      log('[INFO] Using restored session from previous login\n');

      // Grey out and disable all configuration steps - job is already running
      document.getElementById('step1').style.opacity = '0.6';
      document.getElementById('step1').style.pointerEvents = 'none';
      document.getElementById('step1_5').style.opacity = '0.6';
      document.getElementById('step1_5').style.pointerEvents = 'none';
      document.getElementById('step2').style.opacity = '0.6';
      document.getElementById('step2').style.pointerEvents = 'none';
      document.getElementById('step2b').style.opacity = '0.6';
      document.getElementById('step2b').style.pointerEvents = 'none';
      document.getElementById('step3').style.opacity = '0.6';
      document.getElementById('step3').style.pointerEvents = 'none';

      // Enable and show Step 4
      document.getElementById('step4').classList.remove('disabled');
      $('#collapseStep4').collapse('show');

      // Disable the Process Queue button (job already running)
      document.getElementById('btnProcess').disabled = true;
      document.getElementById('btnProcess').textContent = 'Job Already Running';
      document.getElementById('btnProcess').classList.remove('btn-warning');
      document.getElementById('btnProcess').classList.add('btn-default');

      // Hide queue stats during processing (can't retrieve mid-process stats from previous session)
      document.getElementById('queueStats').style.display = 'none';

      // Collapse other steps
      $('#collapseStep1').collapse('hide');
      $('#collapseStep1_5').collapse('hide');
      $('#collapseStep2').collapse('hide');
      $('#collapseStep2b').collapse('hide');
      $('#collapseStep3').collapse('hide');

      // Show the progress UI
      const initialElapsed = status.startTime ? formatDuration(new Date() - new Date(status.startTime)) : '0s';
      const initialProgress = status.totalItems > 0 ? Math.round((status.processedItems / status.totalItems) * 100) : 0;

      document.getElementById('processResults').style.display = 'block';
      document.getElementById('processResultContent').innerHTML = `
        <div class="alert alert-info">
          <h4><img src="images/rocket.svg" class="icon" alt="Launch"> Resuming Job in Progress...</h4>
          <p><strong>Status:</strong> <span id="statusText">Running...</span></p>
          <p><strong>Progress:</strong> <span id="progressText">${status.processedItems} / ${status.totalItems}</span></p>
          <p><strong>Time Elapsed:</strong> <span id="timeElapsed">${initialElapsed}</span></p>
          <p><strong>Estimated Time Remaining:</strong> <span id="timeRemaining">Calculating...</span></p>
          <p><strong>Current MO:</strong> <span id="currentMO">${status.currentMO || '-'}</span></p>
          <p><strong>Current WO:</strong> <span id="currentWO">${status.currentWO || '-'}</span></p>
          <div class="progress" style="margin-top:10px;">
            <div id="progressBar" class="progress-bar progress-bar-striped active" style="width: ${initialProgress}%">
              <span id="progressPercent">${initialProgress}%</span>
            </div>
          </div>
          <div style="margin-top:15px;">
            <button id="btnStopJob" class="btn btn-warning btn-sm"><img src="images/x.svg" class="icon" alt="Stop"> Stop Job</button>
          </div>
          <p style="margin-top:10px;"><small><img src="images/lightbulb.svg" class="icon" alt="Tip"> Job was already running on server - reconnected!</small></p>
        </div>
        <div id="resultsContainer"></div>`;

      // Wire up stop button
      document.getElementById('btnStopJob').addEventListener('click', stopJob);

      // Start polling
      pollQueueStatus();

      return true; // Job resumed

    } else if (status.status === 'stopped') {
      log(`[RESUME] Job was stopped\n`);
      log(`[INFO] Progress: ${status.processedItems}/${status.totalItems}\n`);
      log(`[INFO] Remaining: ${status.totalItems - status.processedItems} item(s)\n\n`);

      // Show stopped banner
      document.getElementById('reconnectBanner').innerHTML = `
        <strong><img src="images/warning.svg" class="icon" alt="Warning"> Job Was Stopped</strong><br>
        The previous job was stopped. ${status.totalItems - status.processedItems} item(s) remain pending.
      `;
      document.getElementById('reconnectBanner').style.display = 'block';
      document.getElementById('reconnectBanner').style.background = '#fff3cd';
      document.getElementById('reconnectBanner').style.borderLeft = '4px solid #ffc107';

      // Enable Step 4 to show stopped state
      document.getElementById('step4').classList.remove('disabled');
      $('#collapseStep4').collapse('show');

      // Show stopped UI
      document.getElementById('processResults').style.display = 'block';
      const stoppedHtml = `
        <div class="alert alert-warning">
          <h4><img src="images/x.svg" class="icon" alt="Stopped"> Job Stopped</h4>
          <hr>
          <p><strong>Total Items:</strong> ${status.totalItems}</p>
          <p><strong>Processed:</strong> ${status.processedItems}</p>
          <p><strong>Remaining:</strong> ${status.totalItems - status.processedItems}</p>
          <p><strong>Successful:</strong> <span class="text-success">${status.successItems}</span></p>
          <p><strong>Failed:</strong> <span class="text-danger">${status.failedItems}</span></p>
        </div>
        <div class="alert alert-info">
          <h5><img src="images/info.svg" class="icon" alt="Info"> What would you like to do?</h5>
          <p><strong>Resume:</strong> Continue processing the remaining ${status.totalItems - status.processedItems} item(s)</p>
          <p><strong>Clear:</strong> Close short incomplete MOs, delete queue records, logout and reset</p>
        </div>
        <div style="margin-top:15px;">
          <button id="btnResumeJob" class="btn btn-success btn-lg btn-block" style="margin-bottom:10px;">
            <img src="images/play.svg" class="icon" alt="Resume"> Resume Job
          </button>
          <button id="btnClearJob" class="btn btn-danger btn-lg btn-block">
            <img src="images/x.svg" class="icon" alt="Clear"> Clear Job & Logout
          </button>
        </div>
      `;

      document.getElementById('processResultContent').innerHTML = stoppedHtml;

      // Wire up buttons
      document.getElementById('btnResumeJob').addEventListener('click', resumeJob);
      document.getElementById('btnClearJob').addEventListener('click', clearJob);

      return true; // Job found (stopped)
    }

    return false; // No active job

  } catch (error) {
    log(`[ERROR] Error checking for active job: ${error.message}\n`);
    return false;
  }
}

/**
 * Format duration in milliseconds to human-readable format
 */
function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return 'N/A';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Calculate duration between two timestamps
 */
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return 'N/A';
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);
  return `${diffMins}m ${diffSecs}s`;
}

/**
 * Poll job status while on login page to prevent login during scheduled jobs
 * Returns the interval ID so it can be cleared when logged in
 */
let loginPagePollingInterval = null;
let lastJobStatus = null;
let lastJobTriggeredBy = null;

export function startLoginPageJobPolling() {
  // Clear any existing polling
  if (loginPagePollingInterval) {
    clearInterval(loginPagePollingInterval);
  }

  // Reset tracking
  lastJobStatus = null;
  lastJobTriggeredBy = null;

  // Check immediately
  checkJobStatusForLogin();

  // Then check every 5 seconds
  loginPagePollingInterval = setInterval(checkJobStatusForLogin, 5000);
}

export function stopLoginPageJobPolling() {
  if (loginPagePollingInterval) {
    clearInterval(loginPagePollingInterval);
    loginPagePollingInterval = null;
  }
  lastJobStatus = null;
  lastJobTriggeredBy = null;
}

async function checkJobStatusForLogin() {
  try {
    const statusResponse = await fetch('/api/queue-status');
    const status = await statusResponse.json();

    const btnLogin = document.getElementById('btnLogin');
    const sessionStatus = document.getElementById('sessionStatus');

    if (status.status === 'running') {
      // Job is running - disable login
      if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.innerHTML = '<img src="images/lock.svg" class="icon" alt="Locked"> Job Running...';
      }
      if (sessionStatus) {
        const percentage = status.totalItems > 0 ? Math.round((status.processedItems / status.totalItems) * 100) : 0;
        sessionStatus.innerHTML = `
          <div class="text-warning" style="margin-bottom: 5px;">
            ⏱️ Scheduled job running: ${status.processedItems}/${status.totalItems} (${percentage}%)
          </div>
          <div class="progress" style="height: 8px; margin-top: 5px; opacity: 0.8;">
            <div class="progress-bar progress-bar-striped progress-bar-animated bg-warning"
                 role="progressbar"
                 style="width: ${percentage}%;"
                 aria-valuenow="${status.processedItems}"
                 aria-valuemin="0"
                 aria-valuemax="${status.totalItems}">
            </div>
          </div>
        `;
      }

      // Grey out login panel (but keep it visible enough to see progress)
      const configPanel = document.querySelector('.config-panel');
      if (configPanel) {
        configPanel.style.opacity = '0.8';
        configPanel.style.pointerEvents = 'none';
      }
    } else {
      // No job running - enable login
      if (btnLogin && btnLogin.disabled && btnLogin.textContent.includes('Job Running')) {
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<img src="images/lock.svg" class="icon" alt="Login"> Login to Fishbowl';
      }
      if (sessionStatus && sessionStatus.textContent.includes('Scheduled job running')) {
        sessionStatus.innerHTML = '<span class="text-muted">Not logged in</span>';
      }

      // Re-enable login panel
      const configPanel = document.querySelector('.config-panel');
      if (configPanel && configPanel.style.opacity === '0.8') {
        configPanel.style.opacity = '1';
        configPanel.style.pointerEvents = 'auto';
      }
    }

    // Detect scheduler job completion and auto-logout
    // If UI is logged in and a scheduler job just completed, trigger logout
    const isLoggedIn = sessionStorage.getItem('sessionToken');
    if (isLoggedIn && lastJobStatus === 'running' &&
        (status.status === 'completed' || status.status === 'idle') &&
        status.triggeredBy === 'scheduler') {
      console.log('[SCHEDULER] Scheduler job completed, auto-logging out UI session');
      const { logout } = await import('./authService.js');
      await logout(true); // Preserve results
    }

    // Update tracking
    lastJobStatus = status.status;
    lastJobTriggeredBy = status.triggeredBy;
  } catch (error) {
    // Silently fail - don't spam console during polling
  }
}
