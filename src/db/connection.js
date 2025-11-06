const mysql = require('mysql2/promise');
const { MYSQL_CONFIG, getMySQLPassword } = require('../config/database');
const constants = require('../config/constants');

/**
 * Connection pool cache
 * Key: database name, Value: pool instance
 */
const pools = new Map();

/**
 * Get or create a connection pool for the given database
 * @param {string} database - Database name
 * @returns {Promise<Pool>} MySQL connection pool
 */
async function getPool(database) {
  // Return existing pool if available
  if (pools.has(database)) {
    return pools.get(database);
  }

  // Create new pool
  const password = await getMySQLPassword();
  const pool = mysql.createPool({
    host: MYSQL_CONFIG.host,
    port: MYSQL_CONFIG.port,
    user: MYSQL_CONFIG.user,
    password: password,
    database: database,
    waitForConnections: true,
    connectionLimit: constants.DB_POOL_SIZE,
    queueLimit: constants.DB_POOL_QUEUE_LIMIT,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  pools.set(database, pool);
  return pool;
}

/**
 * Get a connection from the pool
 * @param {string} database - Database name
 * @returns {Promise<PoolConnection>} MySQL connection from pool
 */
async function getConnection(database) {
  const pool = await getPool(database);
  return await pool.getConnection();
}

/**
 * Create a MySQL connection with the given database
 * DEPRECATED: Use getConnection() instead for better performance with pooling
 * This function is kept for backward compatibility
 * @param {string} database - Database name
 * @returns {Promise<Connection>} MySQL connection
 */
async function createConnection(database) {
  // For backward compatibility, return a connection from the pool
  // The connection will still need to be released with .end()
  return await getConnection(database);
}

/**
 * Close all connection pools
 * Should be called on application shutdown
 * @returns {Promise<void>}
 */
async function closeAllPools() {
  const closePromises = [];
  for (const [database, pool] of pools.entries()) {
    closePromises.push(
      pool.end().then(() => {
        pools.delete(database);
      })
    );
  }
  await Promise.all(closePromises);
}

/**
 * Execute a query using a connection from the pool
 * Automatically handles connection acquisition and release
 * @param {string} database - Database name
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
async function executeQuery(database, sql, params = []) {
  const pool = await getPool(database);
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  createConnection,    // Backward compatible
  getConnection,       // Recommended: Get connection from pool
  getPool,            // Get pool instance directly
  closeAllPools,      // Shutdown helper
  executeQuery        // Simplified query execution
};
