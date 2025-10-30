/**
 * Fetch wrapper that works with both Node.js native fetch and node-fetch
 */
async function fetchWithNode(url, options) {
  let fetch;
  try {
    fetch = globalThis.fetch;
  } catch {
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
  }

  return fetch(url, options);
}

module.exports = {
  fetchWithNode
};
