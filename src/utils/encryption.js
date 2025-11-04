const crypto = require('crypto');

// Load encryption key from environment variable or use legacy key for backward compatibility
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    // Use environment variable if provided (recommended)
    return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  }
  // Fallback to legacy key for backward compatibility with existing encrypted data
  console.warn('WARNING: Using legacy hardcoded encryption key. Set ENCRYPTION_KEY environment variable for better security.');
  return crypto.createHash('sha256').update('manufacturing-orchestrator-secret-key-2024').digest();
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
