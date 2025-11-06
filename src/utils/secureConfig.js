/**
 * Secure Configuration Manager using Windows DPAPI
 *
 * Security Architecture:
 * 1. Generate random Data Encryption Key (DEK) on first setup
 * 2. Protect DEK with Windows DPAPI (bound to service account)
 * 3. Use DEK to encrypt all secrets with AES-256-GCM
 * 4. Store DPAPI-protected DEK + encrypted secrets in config.encrypted.json
 *
 * Benefits:
 * - No encryption keys in plain text anywhere
 * - DPAPI-protected keys only accessible by the service account
 * - Secrets unreadable off the machine or by other users
 * - Auto-decrypts on service startup
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Platform detection
const isWindows = process.platform === 'win32';

// DPAPI module (Windows-only)
let Dpapi;
let isDpapiAvailable = false;
if (isWindows) {
  try {
    const dpapiModule = require('@primno/dpapi');
    Dpapi = dpapiModule.Dpapi;
    isDpapiAvailable = dpapiModule.isPlatformSupported && !!Dpapi;
  } catch (err) {
    console.warn('DPAPI module not available, falling back to basic encryption');
  }
}

const CONFIG_FILE = path.join(__dirname, '../../config.encrypted.json');
const CONFIG_VERSION = 1;

// In-memory cache for decrypted config
let cachedConfig = null;

/**
 * Generate a random Data Encryption Key (DEK)
 */
function generateDEK() {
  return crypto.randomBytes(32); // 256-bit key for AES-256
}

/**
 * Protect DEK using Windows DPAPI
 * @param {Buffer} dek - Data Encryption Key
 * @returns {string} Base64-encoded DPAPI-protected DEK
 */
function protectDEK(dek) {
  if (!isDpapiAvailable) {
    // Fallback: Base64 encode (not secure, but allows cross-platform dev)
    console.warn('WARNING: DPAPI not available. DEK stored with basic encoding. Use Windows for production!');
    return dek.toString('base64');
  }

  // DPAPI protect (bound to current user/service account)
  const protectedData = Dpapi.protectData(dek, null, 'CurrentUser');
  return Buffer.from(protectedData).toString('base64');
}

/**
 * Unprotect DEK using Windows DPAPI
 * @param {string} protectedDEK - Base64-encoded DPAPI-protected DEK
 * @returns {Buffer} Unprotected DEK
 */
function unprotectDEK(protectedDEK) {
  const protectedBuffer = Buffer.from(protectedDEK, 'base64');

  if (!isDpapiAvailable) {
    // Fallback: Base64 decode
    console.warn('WARNING: DPAPI not available. Using basic decoding.');
    return protectedBuffer;
  }

  // DPAPI unprotect
  const unprotectedData = Dpapi.unprotectData(protectedBuffer, null, 'CurrentUser');
  return Buffer.from(unprotectedData);
}

/**
 * Encrypt data using AES-256-GCM
 * @param {Buffer} dek - Data Encryption Key
 * @param {Object} data - Data to encrypt
 * @returns {Object} {iv, authTag, encrypted}
 */
function encryptData(dek, data) {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

  const jsonData = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(jsonData, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted: encrypted.toString('base64')
  };
}

/**
 * Decrypt data using AES-256-GCM
 * @param {Buffer} dek - Data Encryption Key
 * @param {Object} encryptedData - {iv, authTag, encrypted}
 * @returns {Object} Decrypted data
 */
function decryptData(dek, encryptedData) {
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Check if setup has been completed
 */
async function isSetupComplete() {
  try {
    await fs.access(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save secure configuration (first-time setup or update)
 * @param {Object} config - Configuration object
 */
async function saveConfig(config) {
  // Generate or load DEK
  let dek;
  let existingFile;

  try {
    existingFile = await loadConfigFile();
    // Unprotect existing DEK for updates
    dek = unprotectDEK(existingFile.protectedDEK);
  } catch {
    // First time setup - generate new DEK
    dek = generateDEK();
  }

  // Encrypt each section separately
  const encryptedConfig = {
    version: CONFIG_VERSION,
    protectedDEK: protectDEK(dek),
    encrypted: {
      fishbowl: encryptData(dek, config.fishbowl || {}),
      mysql: encryptData(dek, config.mysql || {})
    },
    metadata: {
      createdAt: existingFile?.metadata?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      platform: process.platform
    }
  };

  // Save to file
  await fs.writeFile(CONFIG_FILE, JSON.stringify(encryptedConfig, null, 2), 'utf8');

  // Update cache with the config we just saved
  cachedConfig = config;
}

/**
 * Load encrypted config file
 */
async function loadConfigFile() {
  const data = await fs.readFile(CONFIG_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * Load and decrypt configuration
 * @returns {Object} Decrypted configuration
 */
async function loadConfig() {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load encrypted file
  const encryptedFile = await loadConfigFile();

  // Unprotect DEK
  const dek = unprotectDEK(encryptedFile.protectedDEK);

  // Decrypt each section
  const config = {
    fishbowl: decryptData(dek, encryptedFile.encrypted.fishbowl),
    mysql: decryptData(dek, encryptedFile.encrypted.mysql)
  };

  // Cache for future use
  cachedConfig = config;

  return config;
}

/**
 * Update specific section of config
 * @param {string} section - 'fishbowl' or 'mysql'
 * @param {Object} data - Section data
 */
async function updateConfigSection(section, data) {
  const currentConfig = await loadConfig();
  currentConfig[section] = { ...currentConfig[section], ...data };
  await saveConfig(currentConfig);
}

/**
 * Clear all configuration (reset to factory)
 */
async function clearConfig() {
  try {
    await fs.unlink(CONFIG_FILE);
    cachedConfig = null;
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return true; // Already doesn't exist
    }
    throw err;
  }
}

/**
 * Get configuration status
 */
async function getConfigStatus() {
  const setupComplete = await isSetupComplete();

  if (!setupComplete) {
    return {
      setupComplete: false,
      usingDPAPI: false
    };
  }

  const file = await loadConfigFile();

  return {
    setupComplete: true,
    usingDPAPI: isDpapiAvailable,
    createdAt: file.metadata?.createdAt,
    updatedAt: file.metadata?.updatedAt,
    platform: file.metadata?.platform
  };
}

module.exports = {
  isSetupComplete,
  saveConfig,
  loadConfig,
  updateConfigSection,
  clearConfig,
  getConfigStatus
};
