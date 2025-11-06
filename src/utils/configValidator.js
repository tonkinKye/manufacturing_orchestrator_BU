/**
 * Configuration Validator
 *
 * Validates required configuration and environment variables on startup
 * NOTE: Cannot use logger here as it depends on configuration being valid first
 */

const constants = require('../config/constants');

/**
 * Validates required environment variables
 * @throws {Error} If required configuration is missing
 */
function validateEnvironment() {
  const errors = [];

  // Check PORT
  if (!process.env.PORT) {
    errors.push('PORT environment variable is required');
  } else if (isNaN(parseInt(process.env.PORT))) {
    errors.push('PORT must be a valid number');
  }

  // Check LOG_LEVEL
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  const logLevel = process.env.LOG_LEVEL || 'info';
  if (!validLogLevels.includes(logLevel.toLowerCase())) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }

  // Check ENCRYPTION_KEY if required
  if (constants.ENCRYPTION_REQUIRED && !process.env.ENCRYPTION_KEY) {
    errors.push('ENCRYPTION_KEY environment variable is required. Generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  // Warn if SSL verification is disabled
  if (!constants.SSL_VERIFY) {
    console.warn('⚠️  SSL certificate verification is DISABLED (SSL_VERIFY=false). This is insecure and should only be used in development!');
  }

  // Warn if encryption key is not set
  if (!process.env.ENCRYPTION_KEY && process.platform !== 'win32') {
    console.warn('⚠️  ENCRYPTION_KEY not set on non-Windows platform. Falling back to insecure encryption!');
  }

  if (errors.length > 0) {
    const errorMessage = 'Configuration validation failed:\n  - ' + errors.join('\n  - ');
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  console.log('✓ Configuration validation passed');
}

/**
 * Validates numeric configuration values are within acceptable ranges
 */
function validateNumericRanges() {
  const warnings = [];

  if (constants.BATCH_SIZE < 1 || constants.BATCH_SIZE > 1000) {
    warnings.push(`BATCH_SIZE (${constants.BATCH_SIZE}) should be between 1 and 1000`);
  }

  if (constants.CONCURRENT_WO_LIMIT < 1 || constants.CONCURRENT_WO_LIMIT > 10) {
    warnings.push(`CONCURRENT_WO_LIMIT (${constants.CONCURRENT_WO_LIMIT}) should be between 1 and 10`);
  }

  if (constants.DB_POOL_SIZE < 1 || constants.DB_POOL_SIZE > 100) {
    warnings.push(`DB_POOL_SIZE (${constants.DB_POOL_SIZE}) should be between 1 and 100`);
  }

  if (warnings.length > 0) {
    warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
  }
}

/**
 * Logs current configuration for debugging
 */
function logConfiguration() {
  console.log('Application Configuration:');
  console.log(`  - Port: ${process.env.PORT}`);
  console.log(`  - Log Level: ${process.env.LOG_LEVEL || 'info'}`);
  console.log(`  - Batch Size: ${constants.BATCH_SIZE}`);
  console.log(`  - Concurrent WO Limit: ${constants.CONCURRENT_WO_LIMIT}${constants.CONCURRENT_WO_LIMIT > 1 ? ' ⚠️  CONCURRENT MODE' : ' (sequential)'}`);
  console.log(`  - DB Pool Size: ${constants.DB_POOL_SIZE}`);
  console.log(`  - SSL Verification: ${constants.SSL_VERIFY ? 'Enabled' : 'Disabled'}`);
  console.log(`  - Platform: ${process.platform}`);

  if (constants.CONCURRENT_WO_LIMIT > 1) {
    console.warn('⚠️  CONCURRENT PROCESSING ENABLED - Monitor Fishbowl performance carefully!');
  }
}

/**
 * Main validation function to run on startup
 */
function validateConfig() {
  try {
    validateEnvironment();
    validateNumericRanges();
    logConfiguration();
  } catch (error) {
    // Re-throw to prevent app from starting with invalid config
    throw error;
  }
}

module.exports = {
  validateConfig,
  validateEnvironment,
  validateNumericRanges,
  logConfiguration
};
