const { decrypt } = require('../utils/encryption');

const MYSQL_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  passwordEncrypted: 'e71963f4d621d03a9826635bafc0c669:91229c8e37cf2b34b23fb4082db46b58e7740096c2424a3e8ded85052cc34e6bc714304cb0e0c8d859bfd65135ca7028'
};

function getMySQLPassword() {
  return decrypt(MYSQL_CONFIG.passwordEncrypted);
}

function getMySQLConfig() {
  return {
    ...MYSQL_CONFIG,
    password: getMySQLPassword()
  };
}

module.exports = {
  MYSQL_CONFIG,
  getMySQLPassword,
  getMySQLConfig
};
