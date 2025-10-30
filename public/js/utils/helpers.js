/**
 * Utility helper functions
 */

/**
 * Log a message to the log panel and console
 */
export function log(msg) {
  const el = document.getElementById('log');
  if (el) {
    el.textContent += msg.endsWith('\n') ? msg : `${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }
  console.log('[LOG]', msg);
}

/**
 * Key-value helper for Fishbowl response rows (case-insensitive)
 */
export function kv(row, key) {
  if (!row) return undefined;
  const val = row[key] ?? row[key?.toUpperCase?.()] ?? row[key?.toLowerCase?.()];
  if (val === undefined && row.Row) {
    return row.Row[key] ?? row.Row[key?.toUpperCase?.()] ?? row.Row[key?.toLowerCase?.()];
  }
  return val;
}

/**
 * Populate a select dropdown with options
 */
export function populateSelect(id, options, placeholder = '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> Select') {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = `<option value="">${placeholder}</option>` + options.join('');
  }
}

/**
 * Show/hide an element
 */
export function toggleDisplay(elementId, show) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = show ? 'block' : 'none';
  }
}

/**
 * Set element text content
 */
export function setText(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

/**
 * Set element HTML content
 */
export function setHTML(elementId, html) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = html;
  }
}

/**
 * Enable/disable a button
 */
export function setButtonEnabled(buttonId, enabled) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.disabled = !enabled;
  }
}
