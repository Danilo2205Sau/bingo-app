const { Pool } = require('pg');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false', ...(ca ? { ca } : {}) }
    : false,
  max: positiveInteger(process.env.PG_POOL_MAX, 10),
  idleTimeoutMillis: positiveInteger(process.env.PG_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: positiveInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 5000),
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
