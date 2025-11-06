/**
 * URL Helper Utilities
 *
 * Common URL manipulation functions used throughout the application
 */

/**
 * Normalizes a URL by removing trailing slashes
 * @param {string} url - The URL to normalize
 * @returns {string} - The normalized URL without trailing slash
 */
function normalizeUrl(url) {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Validates if a string is a valid URL
 * @param {string} urlString - The string to validate
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/**
 * Builds a full URL from base and path
 * @param {string} baseUrl - The base URL
 * @param {string} path - The path to append (with or without leading slash)
 * @returns {string} - The complete URL
 */
function buildUrl(baseUrl, path) {
  const normalized = normalizeUrl(baseUrl);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalized}${cleanPath}`;
}

module.exports = {
  normalizeUrl,
  isValidUrl,
  buildUrl
};
