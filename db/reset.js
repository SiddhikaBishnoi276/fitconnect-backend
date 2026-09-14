/**
 * FitConnect Database Reset Script (DESTRUCTIVE - Development only)
 * Drops public schema, recreates it, and runs schema.sql.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ [Reset Failed]: DATABASE_URL is not defined in your .env file.');
  process.exit(1);
}

async function resetDatabase() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ [Reset Failed]: Schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(schemaPath, 'utf8');

  console.log('⚠️ [FitConnect DB Reset]: Connecting to Neon PostgreSQL...');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('💣 [FitConnect DB Reset]: Dropping public schema and recreating fresh...');

    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');

    console.log('✨ [FitConnect DB Reset]: Fresh public schema created. Applying schema.sql...');

    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');

    console.log('✅ [FitConnect DB Reset]: Database successfully reset and migrated!');

    const tableRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const tables = tableRes.rows.map((r) => r.table_name);
    console.log(`📋 [Tables Active (${tables.length})]:`, tables.join(', '));

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ [FitConnect DB Reset Failed]:', error.message);
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    await client.end().catch(() => {});
    process.exit(1);
  }
}

resetDatabase();
