require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function inspectTable() {
  try {
    const constraints = await query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = 'users'::regclass;
    `);
    console.log('Existing constraints on users:', constraints.rows);

    const indexes = await query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename IN ('users', 'user_sports');
    `);
    console.log('Existing indexes:', indexes.rows);
  } catch (err) {
    console.error('Inspection error:', err);
  } finally {
    if (pool) await pool.end();
  }
}

inspectTable();
