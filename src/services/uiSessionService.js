/**
 * UI Session Service
 * Tracks active UI sessions to coordinate with scheduler
 */

let uiSession = {
  isActive: false,
  token: null,
  lastActivity: null,
  loginTime: null
};

/**
 * Mark UI session as active (user logged in)
 * @param {string} token - Authentication token
 */
function startUISession(token) {
  uiSession = {
    isActive: true,
    token: token,
    lastActivity: new Date(),
    loginTime: new Date()
  };
}

/**
 * Update last activity timestamp
 */
function updateActivity() {
  if (uiSession.isActive) {
    uiSession.lastActivity = new Date();
  }
}

/**
 * Mark UI session as inactive (user logged out)
 */
function endUISession() {
  uiSession = {
    isActive: false,
    token: null,
    lastActivity: null,
    loginTime: null
  };
}

/**
 * Check if UI session is currently active
 * @returns {boolean}
 */
function isUISessionActive() {
  return uiSession.isActive;
}

/**
 * Get current UI session info
 * @returns {Object}
 */
function getUISession() {
  return { ...uiSession };
}

module.exports = {
  startUISession,
  updateActivity,
  endUISession,
  isUISessionActive,
  getUISession
};
