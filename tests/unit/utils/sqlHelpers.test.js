/**
 * SQL Helpers Unit Tests
 * Tests for SQL injection prevention utilities
 */

const {
  escapeSqlString,
  quoteSqlString,
  escapeSqlNumber,
  buildInClause,
  validateSerialNumbers,
  validateSqlInput
} = require('../../../src/utils/sqlHelpers');

describe('sqlHelpers', () => {
  describe('escapeSqlString', () => {
    test('should escape single quotes', () => {
      expect(escapeSqlString("O'Brien")).toBe("O''Brien");
      expect(escapeSqlString("It's")).toBe("It''s");
    });

    test('should handle strings without quotes', () => {
      expect(escapeSqlString("Hello World")).toBe("Hello World");
    });

    test('should handle empty string', () => {
      expect(escapeSqlString("")).toBe("");
    });

    test('should handle null/undefined', () => {
      expect(escapeSqlString(null)).toBe('NULL');
      expect(escapeSqlString(undefined)).toBe('NULL');
    });

    test('should throw on non-string input', () => {
      expect(() => escapeSqlString(123)).toThrow();
      expect(() => escapeSqlString({})).toThrow();
    });
  });

  describe('quoteSqlString', () => {
    test('should escape and quote strings', () => {
      expect(quoteSqlString("Hello")).toBe("'Hello'");
      expect(quoteSqlString("O'Brien")).toBe("'O''Brien'");
    });
  });

  describe('escapeSqlNumber', () => {
    test('should accept valid numbers', () => {
      expect(escapeSqlNumber(123, 'test')).toBe(123);
      expect(escapeSqlNumber(45.67, 'test')).toBe(45.67);
      expect(escapeSqlNumber('123', 'test')).toBe(123);
    });

    test('should reject invalid numbers', () => {
      expect(() => escapeSqlNumber('abc', 'test')).toThrow();
      expect(() => escapeSqlNumber(NaN, 'test')).toThrow();
      expect(() => escapeSqlNumber(Infinity, 'test')).toThrow();
    });
  });

  describe('buildInClause', () => {
    test('should build IN clause for strings', () => {
      const result = buildInClause(['item1', 'item2', 'item3'], 'string');
      expect(result).toBe("'item1', 'item2', 'item3'");
    });

    test('should escape quotes in strings', () => {
      const result = buildInClause(["O'Brien", "It's"], 'string');
      expect(result).toBe("'O''Brien', 'It''s'");
    });

    test('should build IN clause for numbers', () => {
      const result = buildInClause([1, 2, 3], 'number');
      expect(result).toBe('1, 2, 3');
    });

    test('should throw on empty array', () => {
      expect(() => buildInClause([], 'string')).toThrow();
    });

    test('should throw on too many values', () => {
      const largeArray = Array(1001).fill('item');
      expect(() => buildInClause(largeArray, 'string')).toThrow();
    });

    test('should throw on invalid type', () => {
      expect(() => buildInClause(['item'], 'invalid')).toThrow();
    });
  });

  describe('validateSerialNumbers', () => {
    test('should accept valid serial numbers', () => {
      expect(() => validateSerialNumbers(['SN123', 'SN456'])).not.toThrow();
      expect(() => validateSerialNumbers(['ABC-123', 'XYZ_789'])).not.toThrow();
    });

    test('should throw on empty array', () => {
      expect(() => validateSerialNumbers([])).toThrow();
    });

    test('should throw on non-array', () => {
      expect(() => validateSerialNumbers('not-array')).toThrow();
    });

    test('should throw on invalid serial format', () => {
      expect(() => validateSerialNumbers(['valid', 'has spaces'])).toThrow();
      expect(() => validateSerialNumbers(['valid', 'has@symbol'])).toThrow();
    });

    test('should throw on too long serial', () => {
      const longSerial = 'A'.repeat(101);
      expect(() => validateSerialNumbers([longSerial])).toThrow();
    });

    test('should throw on empty serial', () => {
      expect(() => validateSerialNumbers([''])).toThrow();
    });
  });

  describe('validateSqlInput', () => {
    test('should accept safe inputs', () => {
      expect(() => validateSqlInput('SafeValue123', 'test')).not.toThrow();
      expect(() => validateSqlInput('Value-With_Dash', 'test')).not.toThrow();
    });

    test('should throw on SQL injection attempts', () => {
      expect(() => validateSqlInput("'; DROP TABLE users--", 'test')).toThrow();
      expect(() => validateSqlInput("1' OR '1'='1", 'test')).toThrow();
      expect(() => validateSqlInput("value; DELETE FROM table", 'test')).toThrow();
      expect(() => validateSqlInput("value/* comment */", 'test')).toThrow();
    });

    test('should throw on non-string', () => {
      expect(() => validateSqlInput(123, 'test')).toThrow();
      expect(() => validateSqlInput({}, 'test')).toThrow();
    });

    test('should throw on empty string', () => {
      expect(() => validateSqlInput('', 'test')).toThrow();
    });

    test('should throw on too long string', () => {
      const longString = 'A'.repeat(256);
      expect(() => validateSqlInput(longString, 'test')).toThrow();
    });
  });
});
