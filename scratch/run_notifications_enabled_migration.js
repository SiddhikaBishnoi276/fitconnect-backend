require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function runMigration() {
  try {
    console.log('--- Adding notifications_enabled column ---');
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;`);
    console.log('✅ Column added or already exists.');

    const colCheck = await query(`
      SELECT column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'notifications_enabled';
    `);
    console.log('Column details:');
    console.table(colCheck.rows);
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();
