// PostgreSQL / Neon DB connection pool & query helpers using pg (node-postgres)
const { Pool } = require('pg');
const env = require('./env.config');

const connectionString = env.DATABASE_URL || process.env.DATABASE_URL;

// Check if credentials are still placeholder defaults
const isPlaceholder = !connectionString || 
  connectionString.includes('your_password_here') || 
  connectionString.includes('ep-xyz-pooler');

let pool = null;

if (connectionString && !isPlaceholder) {
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false, // Required for secure connection to Neon Postgres
    },
  });

  pool.on('error', (err) => {
    const errorMsg = err?.message || (typeof err === 'string' ? err : 'Connection event error');
    console.warn('⚠️ [PostgreSQL Pool Warning]:', errorMsg);
  });
}

/**
 * Executes a parameterized SQL query using the connection pool.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params = []) => {
  if (isPlaceholder || !pool) {
    throw new Error('Database is not initialized. Please set your real Neon DATABASE_URL in .env');
  }

  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ [Database Query Error]:', { text, error: error.message });
    throw error;
  }
};

/**
 * Acquires a client from the connection pool (useful for transactions).
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = async () => {
  if (isPlaceholder || !pool) {
    throw new Error('Database is not initialized. Please set your real Neon DATABASE_URL in .env');
  }
  return await pool.connect();
};

/**
 * Helper to test database connection and output status
 * @returns {Promise<boolean>}
 */
const testConnection = async () => {
  if (isPlaceholder || !connectionString) {
    console.warn('⚠️ [Neon DB]: DATABASE_URL is missing or contains placeholder values. Please check .env');
    return false;
  }

  try {
    const result = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`✅ [Neon DB Connected]: Database "${result.rows[0].db_name}" at ${result.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.error('❌ [Neon DB Connection Failed]:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};
