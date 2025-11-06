const crypto = require('crypto');
const constants = require('../config/constants');

// Load encryption key from environment variable
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    // Use environment variable (recommended and required)
    return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  }

  // Only allow fallback if explicitly disabled in config
  if (!constants.ENCRYPTION_REQUIRED) {
    // This is ONLY for development/testing on non-Windows platforms
    // NEVER use this in production!
    console.error('⚠️  CRITICAL: Using insecure fallback encryption key! Set ENCRYPTION_KEY environment variable!');
    console.error('⚠️  Generate a secure key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    return crypto.createHash('sha256').update('manufacturing-orchestrator-secret-key-2024').digest();
  }

  // Fail hard if encryption key is required but not provided
  throw new Error(
    'ENCRYPTION_KEY environment variable is required but not set.\n' +
    'Generate a secure key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = parts.join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};
