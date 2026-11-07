module.exports = async function globalTeardown() {
  const db = require('../src/config/db');
  await db.pool.end();
};
