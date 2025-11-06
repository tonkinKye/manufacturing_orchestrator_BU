/**
 * Application Constants
 *
 * Centralized configuration values used throughout the application.
 * These can be overridden via environment variables where applicable.
 */

module.exports = {
  // Queue Processing
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || 100,
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 1,
  CONCURRENT_WO_LIMIT: parseInt(process.env.CONCURRENT_WO_LIMIT) || 1, // Set to 1 for sequential, increase for parallel

  // Polling & Timeouts
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS) || 1000,
  JOB_TIMEOUT_MS: parseInt(process.env.JOB_TIMEOUT_MS) || 3600000, // 1 hour
  API_REQUEST_TIMEOUT_MS: parseInt(process.env.API_REQUEST_TIMEOUT_MS) || 30000, // 30 seconds

  // Logging
  LOG_MAX_SIZE: process.env.LOG_MAX_SIZE || '10m',
  LOG_MAX_AGE: process.env.LOG_MAX_AGE || '7d',
  LOG_MAX_FILES: parseInt(process.env.LOG_MAX_FILES) || 10,

  // Database Connection Pool
  DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE) || 10,
  DB_POOL_QUEUE_LIMIT: parseInt(process.env.DB_POOL_QUEUE_LIMIT) || 0, // 0 = unlimited
  DB_CONNECTION_TIMEOUT_MS: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS) || 10000,

  // Security
  SSL_VERIFY: process.env.SSL_VERIFY !== 'false', // Default to true, explicitly set to 'false' to disable
  ENCRYPTION_REQUIRED: process.env.ENCRYPTION_REQUIRED !== 'false', // Require ENCRYPTION_KEY env var
  SESSION_CLEANUP_INTERVAL_MS: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS) || 3600000, // 1 hour

  // Cache
  CACHE_TTL_MS: parseInt(process.env.CACHE_TTL_MS) || 300000, // 5 minutes
  CACHE_CHECK_PERIOD_MS: parseInt(process.env.CACHE_CHECK_PERIOD_MS) || 60000, // 1 minute

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // File Paths
  TOKEN_STORE_PATH: process.env.TOKEN_STORE_PATH || './token-store.json',
  SECURE_CONFIG_PATH: process.env.SECURE_CONFIG_PATH || './secure-config.json',

  // Job Status
  JOB_STATUS: {
    IDLE: 'idle',
    RUNNING: 'running',
    STOPPED: 'stopped',
    COMPLETED: 'completed',
    ERROR: 'error'
  },

  // Queue Item Status
  QUEUE_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },

  // MO Types
  MO_TYPES: {
    BUILD: 'BUILD',
    DISASSEMBLE: 'DISASSEMBLE'
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  }
};
