/**
 * Queue API communication layer
 */

import { log } from '../utils/helpers.js';

/**
 * Initialize queue table in database
 */
export async function initializeQueueTable(databaseName) {
  try {
    log('[DB] Initializing queue table...\n');
    log(`[DB] Using database: ${databaseName}\n`);

    const response = await fetch('/api/mysql/init-queue-table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: databaseName })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    log(`[OK] Queue table ready in database: ${result.database}\n`);
    log(`[DB] Table has ${result.rowCount || 0} existing row(s)\n`);

  } catch (e) {
    log(`[ERROR] Error initializing queue table: ${e.message}\n`);
    alert(`Database Initialization Failed:\n\n${e.message}\n\nPlease contact your system administrator.`);
    throw e;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  try {
    const { fishbowlQuery } = await import('./fishbowlApi.js');
    const { kv } = await import('../utils/helpers.js');

    const sql = `
      SELECT
        status,
        COUNT(*) as count,
        COUNT(DISTINCT mo_number) as mo_count
      FROM mo_queue
      GROUP BY status
    `;
    const rows = await fishbowlQuery(sql);

    const stats = {
      pending: 0,
      success: 0,
      failed: 0,
      total: 0,
      moCount: 0
    };

    rows.forEach(row => {
      const status = (kv(row, 'status') || '').toLowerCase();
      const count = parseInt(kv(row, 'count') || 0);

      if (status === 'pending') stats.pending = count;
      else if (status === 'success') stats.success = count;
      else if (status === 'failed') stats.failed = count;

      stats.total += count;
    });

    const moSQL = "SELECT COUNT(DISTINCT mo_number) as mo_count FROM mo_queue WHERE mo_number IS NOT NULL";
    const moResult = await fishbowlQuery(moSQL);
    stats.moCount = parseInt(kv(moResult[0], 'mo_count') || 0);

    return stats;
  } catch (e) {
    log(`[ERROR] Error getting queue stats: ${e.message}\n`);
    return { pending: 0, success: 0, failed: 0, total: 0, moCount: 0 };
  }
}

/**
 * Save items to queue
 */
export async function saveToQueueDB(items) {
  const response = await fetch('/api/mysql/save-to-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

/**
 * Process queue
 */
export async function processQueueRequest() {
  const response = await fetch('/api/process-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Check job status
 */
export async function checkJobStatus() {
  const response = await fetch('/api/job-status', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}
