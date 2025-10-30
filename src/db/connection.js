const mysql = require('mysql2/promise');
const { MYSQL_CONFIG, getMySQLPassword } = require('../config/database');

/**
 * Create a MySQL connection with the given database
 * @param {string} database - Database name
 * @returns {Promise<Connection>} MySQL connection
 */
async function createConnection(database) {
  return await mysql.createConnection({
    host: MYSQL_CONFIG.host,
    port: MYSQL_CONFIG.port,
    user: MYSQL_CONFIG.user,
    password: getMySQLPassword(),
    database: database
  });
}

module.exports = {
  createConnection
};
