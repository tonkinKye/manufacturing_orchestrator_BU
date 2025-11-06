/**
 * Config Validator Unit Tests
 */

const { validateEnvironment, validateNumericRanges } = require('../../../src/utils/configValidator');

// Mock console to prevent test output pollution
global.console = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('configValidator', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    test('should pass with valid configuration', () => {
      process.env.PORT = '3000';
      process.env.LOG_LEVEL = 'info';
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('should throw if PORT is missing', () => {
      delete process.env.PORT;
      process.env.LOG_LEVEL = 'info';

      expect(() => validateEnvironment()).toThrow('PORT environment variable is required');
    });

    test('should throw if PORT is not a number', () => {
      process.env.PORT = 'not-a-number';
      process.env.LOG_LEVEL = 'info';

      expect(() => validateEnvironment()).toThrow('PORT must be a valid number');
    });

    test('should throw if LOG_LEVEL is invalid', () => {
      process.env.PORT = '3000';
      process.env.LOG_LEVEL = 'invalid';

      expect(() => validateEnvironment()).toThrow(/LOG_LEVEL must be one of/);
    });
  });

  describe('validateNumericRanges', () => {
    test('should not throw on valid ranges', () => {
      process.env.BATCH_SIZE = '100';
      process.env.CONCURRENT_WO_LIMIT = '1';
      process.env.DB_POOL_SIZE = '10';

      expect(() => validateNumericRanges()).not.toThrow();
    });
  });
});
