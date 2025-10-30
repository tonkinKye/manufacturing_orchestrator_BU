/**
 * Fishbowl API communication layer
 */

import { sessionToken, getServerUrl } from '../utils/state.js';

/**
 * Call Fishbowl API endpoint
 */
export async function fishbowlAPI(endpoint, payload) {
  const serverUrl = getServerUrl();

  if (!sessionToken) {
    throw new Error('Not logged in. Please login first.');
  }

  const response = await fetch(`/api/fishbowl/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverUrl: serverUrl,
      token: sessionToken,
      payload: payload
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.FbiJson?.FbiMsgsRs?.ErrorRs) {
    throw new Error(data.FbiJson.FbiMsgsRs.ErrorRs.statusMessage || 'Fishbowl API error');
  }

  return data;
}

/**
 * Call Fishbowl REST endpoint
 */
export async function fishbowlREST(endpoint, method = 'POST', payload = null) {
  const serverUrl = getServerUrl();

  if (!sessionToken) {
    throw new Error('Not logged in. Please login first.');
  }

  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverUrl: serverUrl,
      token: sessionToken,
      method: method,
      payload: payload
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Execute SQL query via Fishbowl
 */
export async function fishbowlQuery(sql) {
  const serverUrl = getServerUrl();

  if (!sessionToken) {
    throw new Error('Not logged in. Please login first.');
  }

  const response = await fetch('/api/data-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverUrl: serverUrl,
      token: sessionToken,
      sql: sql
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * Execute unsafe SQL query (deprecated)
 */
export async function fishbowlUnsafeQuery(sql) {
  const serverUrl = getServerUrl();

  if (!sessionToken) {
    throw new Error('Not logged in. Please login first.');
  }

  const response = await fetch('/api/unsafe/deprecated/data-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverUrl: serverUrl,
      token: sessionToken,
      sql: sql
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * Detect database name
 */
export async function detectDatabaseName() {
  try {
    const sql = 'SELECT DATABASE() as current_db';
    const rows = await fishbowlQuery(sql);

    if (!rows || rows.length === 0) {
      throw new Error('Could not detect database name');
    }

    // Import kv helper
    const { kv } = await import('../utils/helpers.js');
    const databaseName = kv(rows[0], 'current_db');

    if (!databaseName) {
      throw new Error('Database name is null or empty');
    }

    return databaseName;
  } catch (e) {
    throw new Error(`Database detection failed: ${e.message}`);
  }
}
