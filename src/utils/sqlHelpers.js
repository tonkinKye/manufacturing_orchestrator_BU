/**
 * SQL Helper Utilities
 *
 * WARNING: These helpers are used for building SQL queries for the Fishbowl API
 * which does not support parameterized queries. Use with caution and always
 * validate inputs before passing to these functions.
 *
 * The Fishbowl API's data-query endpoint accepts raw SQL strings, so we must
 * build queries manually. These utilities help reduce SQL injection risk through
 * proper escaping and validation.
 */

/**
 * Validates that a string contains only safe characters for SQL
 * @param {string} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {RegExp} allowedPattern - Optional custom pattern (default: alphanumeric, dash, underscore, space, period)
 * @throws {Error} If validation fails
 */
function validateSqlInput(value, fieldName, allowedPattern = /^[a-zA-Z0-9\-_ .]+$/) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  if (value.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  if (value.length > 255) {
    throw new Error(`${fieldName} exceeds maximum length of 255 characters`);
  }

  // Check for common SQL injection patterns
  const dangerousPatterns = [
    /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|EXEC|EXECUTE)\s+/i,
    /--/,
    /\/\*/,
    /\*\//,
    /xp_/i,
    /sp_/i,
    /UNION\s+SELECT/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(value)) {
      throw new Error(`${fieldName} contains potentially dangerous SQL pattern`);
    }
  }
}

/**
 * Escapes a string value for use in SQL queries
 * Uses standard SQL escaping: replace ' with ''
 * @param {string} value - The value to escape
 * @returns {string} - The escaped value
 */
function escapeSqlString(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value !== 'string') {
    throw new Error('escapeSqlString only accepts string values');
  }

  // Standard SQL escaping: single quote becomes two single quotes
  return value.replace(/'/g, "''");
}

/**
 * Escapes and quotes a string value for SQL
 * @param {string} value - The value to escape and quote
 * @returns {string} - The quoted and escaped value (e.g., 'value')
 */
function quoteSqlString(value) {
  return `'${escapeSqlString(value)}'`;
}

/**
 * Validates and escapes a numeric value for SQL
 * @param {number|string} value - The numeric value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {number} - The validated number
 */
function escapeSqlNumber(value, fieldName) {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num) || !isFinite(num)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  return num;
}

/**
 * Escapes a SQL identifier (table name, column name, etc.)
 * Uses backticks for MySQL/Fishbowl compatibility
 * @param {string} identifier - The identifier to escape
 * @returns {string} - The escaped identifier
 */
function escapeSqlIdentifier(identifier) {
  if (typeof identifier !== 'string') {
    throw new Error('Identifier must be a string');
  }

  // Remove any existing backticks and escape
  const cleaned = identifier.replace(/`/g, '');

  // Validate identifier (alphanumeric, underscore, period for qualified names)
  if (!/^[a-zA-Z0-9_$.]+$/.test(cleaned)) {
    throw new Error('Identifier contains invalid characters');
  }

  return `\`${cleaned}\``;
}

/**
 * Builds an IN clause for SQL with proper escaping
 * @param {Array<string|number>} values - Array of values
 * @param {string} type - Type of values: 'string' or 'number'
 * @returns {string} - The IN clause content (e.g., "'val1', 'val2'" or "1, 2, 3")
 */
function buildInClause(values, type = 'string') {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('buildInClause requires a non-empty array');
  }

  if (values.length > 1000) {
    throw new Error('IN clause limited to 1000 values for performance');
  }

  if (type === 'string') {
    return values.map(v => quoteSqlString(String(v))).join(', ');
  } else if (type === 'number') {
    return values.map(v => escapeSqlNumber(v, 'IN clause value')).join(', ');
  } else {
    throw new Error('buildInClause type must be "string" or "number"');
  }
}

/**
 * Validates an array of serial numbers
 * Serial numbers should be alphanumeric with limited special chars
 * @param {Array<string>} serials - Array of serial numbers
 * @throws {Error} If any serial number is invalid
 */
function validateSerialNumbers(serials) {
  if (!Array.isArray(serials) || serials.length === 0) {
    throw new Error('Serial numbers must be a non-empty array');
  }

  // Serial numbers typically contain: letters, numbers, dash, underscore, period
  const serialPattern = /^[a-zA-Z0-9\-_.]+$/;

  for (const serial of serials) {
    if (typeof serial !== 'string') {
      throw new Error('Serial number must be a string');
    }

    if (serial.length === 0 || serial.length > 100) {
      throw new Error('Serial number must be between 1 and 100 characters');
    }

    if (!serialPattern.test(serial)) {
      throw new Error(`Invalid serial number format: ${serial}`);
    }
  }
}

module.exports = {
  validateSqlInput,
  escapeSqlString,
  quoteSqlString,
  escapeSqlNumber,
  escapeSqlIdentifier,
  buildInClause,
  validateSerialNumbers
};
