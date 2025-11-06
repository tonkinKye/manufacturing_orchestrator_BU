/**
 * URL Helpers Unit Tests
 */

const { normalizeUrl, isValidUrl, buildUrl } = require('../../../src/utils/urlHelpers');

describe('urlHelpers', () => {
  describe('normalizeUrl', () => {
    test('should remove trailing slash', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
      expect(normalizeUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    });

    test('should not modify URL without trailing slash', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com');
      expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
    });

    test('should handle empty string', () => {
      expect(normalizeUrl('')).toBe('');
    });

    test('should handle null/undefined', () => {
      expect(normalizeUrl(null)).toBe('');
      expect(normalizeUrl(undefined)).toBe('');
    });

    test('should handle multiple trailing slashes', () => {
      expect(normalizeUrl('https://example.com//')).toBe('https://example.com/');
    });
  });

  describe('isValidUrl', () => {
    test('should return true for valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('http://192.168.1.1:8080')).toBe(true);
    });

    test('should return true for valid HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://api.example.com/v1')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
    });

    test('should return false for null/undefined', () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
    });
  });

  describe('buildUrl', () => {
    test('should combine base URL and path', () => {
      expect(buildUrl('https://example.com', 'api/users')).toBe('https://example.com/api/users');
      expect(buildUrl('http://localhost:3000', '/api/users')).toBe('http://localhost:3000/api/users');
    });

    test('should handle trailing slash in base URL', () => {
      expect(buildUrl('https://example.com/', 'api/users')).toBe('https://example.com/api/users');
      expect(buildUrl('https://example.com/', '/api/users')).toBe('https://example.com/api/users');
    });

    test('should handle leading slash in path', () => {
      expect(buildUrl('https://example.com', '/api/users')).toBe('https://example.com/api/users');
    });

    test('should handle both trailing and leading slashes', () => {
      expect(buildUrl('https://example.com/', '/api/users')).toBe('https://example.com/api/users');
    });
  });
});
