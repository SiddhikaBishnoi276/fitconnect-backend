// PostgreSQL / Neon DB connection pool & query helpers
const { neon, Pool } = require('@neondatabase/serverless');
const env = require('./env.config');

// Get database connection string (DATABASE_URL from Neon console is prioritized)
const connectionString = env.DATABASE_URL || (
  env.DB_USER && env.DB_HOST && env.DB_HOST !== 'localhost'
    ? `postgresql://${env.DB_USER}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}?sslmode=require`
    : null
);

// Check if credentials are still placeholder defaults
const isPlaceholder = !connectionString || 
  connectionString.includes('your_password_here') || 
  connectionString.includes('ep-xyz-pooler');

let sql = null;
let pool = null;

if (connectionString && !isPlaceholder) {
  // 1. HTTP-based Neon SQL tagged-template client (fast queries, no connection exhaustion)
  sql = neon(connectionString);

  // 2. WebSocket-based Neon Pool (node-postgres pg.Pool compatible for transactions and queries)
  pool = new Pool({ connectionString });

  pool.on('error', (err) => {
    // Avoid crashing on idle client network hiccups
    const errorMsg = err?.message || (typeof err === 'string' ? err : 'Connection event error');
    console.warn('⚠️ [Neon DB Pool]:', errorMsg);
  });
}

/**
 * Executes a parameterized SQL query using the connection pool.
 * Compatible with node-postgres style queries.
 * @param {string} text - SQL query string with $1, $2 placeholders
 * @param {Array} [params] - Query parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params = []) => {
  if (isPlaceholder || !pool) {
    throw new Error('Database is not initialized. Please set your real Neon DATABASE_URL in fitconnect-backend/.env');
  }

  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development') {
      // Query timing debug info if needed
    }
    return result;
  } catch (error) {
    console.error('❌ [Database Query Error]:', { text, error: error.message });
    throw error;
  }
};

/**
 * Helper to test database connection and output status
 * @returns {Promise<boolean>}
 */
const testConnection = async () => {
  if (isPlaceholder || !connectionString) {
    console.warn('⚠️ [Neon DB]: DATABASE_URL contains placeholder values. Please paste your real Neon connection string in fitconnect-backend/.env');
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
  sql,
  pool,
  query,
  testConnection,
};
