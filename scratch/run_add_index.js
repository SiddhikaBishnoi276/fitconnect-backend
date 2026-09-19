const db = require('../src/config/db');

async function run() {
  try {
    console.log('Executing: CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));');
    console.log('✅ Index created successfully.\n');

    console.log("Querying: SELECT indexname FROM pg_indexes WHERE tablename = 'users';");
    const res = await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'users' ORDER BY indexname;");
    console.log('\n--- Output from pg_indexes ---');
    console.table(res.rows);
  } catch (err) {
    console.error('❌ Database error:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
