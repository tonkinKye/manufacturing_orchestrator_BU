/**
 * Application state management
 */

// Session state
export let sessionToken = null;
export let sessionCredentials = { username: '', password: '', database: '' };

// Application state
export const state = {
  locationGroup: null,
  bom: null,
  bomId: null,
  bomDefaultLocation: null,
  csvData: null,
  mapping: null,
  chunks: null,
  validationResults: null,
  operationType: null, // 'build' or 'disassemble'
  finishedGoods: [], // For disassembly: available FG list
  selectedFinishedGoods: [] // For disassembly: selected FG list
};

// Polling interval for job status
export let pollInterval = null;

/**
 * Set session token
 */
export function setSessionToken(token) {
  sessionToken = token;
}

/**
 * Set session credentials
 */
export function setSessionCredentials(credentials) {
  sessionCredentials = credentials;
}

/**
 * Clear session
 */
export function clearSession() {
  sessionToken = null;
  sessionCredentials = { username: '', password: '', database: '' };
}

/**
 * Reset application state
 */
export function resetState() {
  state.locationGroup = null;
  state.bom = null;
  state.bomId = null;
  state.bomDefaultLocation = null;
  state.csvData = null;
  state.mapping = null;
  state.chunks = null;
  state.validationResults = null;
  state.operationType = null;
  state.finishedGoods = [];
  state.selectedFinishedGoods = [];
}

/**
 * Set poll interval
 */
export function setPollInterval(interval) {
  pollInterval = interval;
}

/**
 * Clear poll interval
 */
export function clearPollInterval() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Get server URL from form
 */
export function getServerUrl() {
  return document.getElementById('serverUrl')?.value?.trim() || '';
}
