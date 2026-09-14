/**
 * FitConnect Schema Migration Runner
 * Executes /db/schema.sql against Neon PostgreSQL in a single transaction.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ [Migration Failed]: DATABASE_URL is not defined in your .env file.');
  process.exit(1);
}

async function runMigration() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ [Migration Failed]: Schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(schemaPath, 'utf8');

  console.log('🚀 [FitConnect Migration]: Connecting to Neon PostgreSQL...');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('🔗 [FitConnect Migration]: Connected successfully. Running schema.sql in transaction...');

    const startTime = Date.now();

    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [FitConnect Migration]: Schema migration completed successfully in ${duration}s!`);

    // Verify created tables
    const tableRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const tables = tableRes.rows.map((r) => r.table_name);
    console.log(`📋 [Tables Created (${tables.length})]:`, tables.join(', '));

    // Verify materialized view
    const matViewRes = await client.query(
      "SELECT matviewname FROM pg_matviews WHERE schemaname = 'public';"
    );
    const matViews = matViewRes.rows.map((r) => r.matviewname);
    if (matViews.length > 0) {
      console.log(`📊 [Materialized Views (${matViews.length})]:`, matViews.join(', '));
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ [FitConnect Migration Failed]:', error.message);
    try {
      await client.query('ROLLBACK');
      console.log('🔄 [Transaction Rolled Back]');
    } catch (rollbackErr) {
      console.error('⚠️ [Rollback Error]:', rollbackErr.message);
    }
    await client.end().catch(() => {});
    process.exit(1);
  }
}

runMigration();
