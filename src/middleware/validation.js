/**
 * Input Validation Middleware
 *
 * Provides validation helpers for API request parameters
 */

/**
 * Validation error class
 */
class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

/**
 * Validates required fields are present in request body
 * @param {Array<string>} fields - Required field names
 * @returns {Function} Express middleware
 */
function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];

    for (const field of fields) {
      // Support nested fields like 'user.email'
      const value = field.split('.').reduce((obj, key) => obj?.[key], req.body);
      if (value === undefined || value === null || value === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Missing required fields: ${missing.join(', ')}`,
        fields: missing
      });
    }

    next();
  };
}

/**
 * Validates field is a string
 * @param {string} field - Field name
 * @param {Object} options - Validation options {minLength, maxLength, pattern}
 * @returns {Function} Express middleware
 */
function validateString(field, options = {}) {
  return (req, res, next) => {
    const value = req.body[field];

    if (value === undefined || value === null) {
      return next(); // Skip if not present (use validateRequired for required checks)
    }

    if (typeof value !== 'string') {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be a string`,
        field
      });
    }

    if (options.minLength && value.length < options.minLength) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be at least ${options.minLength} characters`,
        field
      });
    }

    if (options.maxLength && value.length > options.maxLength) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be at most ${options.maxLength} characters`,
        field
      });
    }

    if (options.pattern && !options.pattern.test(value)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' has invalid format`,
        field
      });
    }

    next();
  };
}

/**
 * Validates field is a number
 * @param {string} field - Field name
 * @param {Object} options - Validation options {min, max, integer}
 * @returns {Function} Express middleware
 */
function validateNumber(field, options = {}) {
  return (req, res, next) => {
    const value = req.body[field];

    if (value === undefined || value === null) {
      return next(); // Skip if not present
    }

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num) || !isFinite(num)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be a valid number`,
        field
      });
    }

    if (options.integer && !Number.isInteger(num)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be an integer`,
        field
      });
    }

    if (options.min !== undefined && num < options.min) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be at least ${options.min}`,
        field
      });
    }

    if (options.max !== undefined && num > options.max) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be at most ${options.max}`,
        field
      });
    }

    // Convert string to number in body
    if (typeof value === 'string') {
      req.body[field] = num;
    }

    next();
  };
}

/**
 * Validates field is an array
 * @param {string} field - Field name
 * @param {Object} options - Validation options {minLength, maxLength, itemType}
 * @returns {Function} Express middleware
 */
function validateArray(field, options = {}) {
  return (req, res, next) => {
    const value = req.body[field];

    if (value === undefined || value === null) {
      return next(); // Skip if not present
    }

    if (!Array.isArray(value)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be an array`,
        field
      });
    }

    if (options.minLength && value.length < options.minLength) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must have at least ${options.minLength} items`,
        field
      });
    }

    if (options.maxLength && value.length > options.maxLength) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must have at most ${options.maxLength} items`,
        field
      });
    }

    if (options.itemType) {
      const invalidItems = value.filter(item => typeof item !== options.itemType);
      if (invalidItems.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          message: `All items in '${field}' must be of type ${options.itemType}`,
          field
        });
      }
    }

    next();
  };
}

/**
 * Validates field is a boolean
 * @param {string} field - Field name
 * @returns {Function} Express middleware
 */
function validateBoolean(field) {
  return (req, res, next) => {
    const value = req.body[field];

    if (value === undefined || value === null) {
      return next(); // Skip if not present
    }

    if (typeof value !== 'boolean') {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be a boolean`,
        field
      });
    }

    next();
  };
}

/**
 * Validates field is one of allowed values
 * @param {string} field - Field name
 * @param {Array} allowedValues - Array of allowed values
 * @returns {Function} Express middleware
 */
function validateEnum(field, allowedValues) {
  return (req, res, next) => {
    const value = req.body[field];

    if (value === undefined || value === null) {
      return next(); // Skip if not present
    }

    if (!allowedValues.includes(value)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Field '${field}' must be one of: ${allowedValues.join(', ')}`,
        field,
        allowedValues
      });
    }

    next();
  };
}

/**
 * Sanitizes string input to prevent XSS
 * @param {string} field - Field name
 * @returns {Function} Express middleware
 */
function sanitizeString(field) {
  return (req, res, next) => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      // Remove potential XSS vectors
      req.body[field] = req.body[field]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, ''); // Remove inline event handlers
    }
    next();
  };
}

/**
 * Combine multiple validation middlewares
 * @param {Array<Function>} validators - Array of validator middleware functions
 * @returns {Function} Express middleware
 */
function validate(...validators) {
  return (req, res, next) => {
    let index = 0;

    const runNext = (err) => {
      if (err) return next(err);

      if (index >= validators.length) {
        return next();
      }

      const validator = validators[index++];
      validator(req, res, runNext);
    };

    runNext();
  };
}

module.exports = {
  ValidationError,
  validateRequired,
  validateString,
  validateNumber,
  validateArray,
  validateBoolean,
  validateEnum,
  sanitizeString,
  validate
};
