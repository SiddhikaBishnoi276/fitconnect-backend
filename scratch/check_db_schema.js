require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function checkSchema() {
  try {
    console.log('Connecting to database and running query...');
    const result = await query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;");
    console.log('\n--- COLUMNS IN "users" TABLE ---');
    console.table(result.rows);
    
    const hasUsername = result.rows.some(r => r.column_name === 'username');
    console.log(`\nDoes 'username' exist? -> ${hasUsername ? 'YES' : 'NO'}`);
    
    if (!hasUsername) {
      console.log('\nRunning ALTER TABLE to add username column...');
      await query('ALTER TABLE users ADD COLUMN username TEXT UNIQUE;');
      console.log('✅ ALTER TABLE users ADD COLUMN username TEXT UNIQUE executed successfully!');
      
      const verify = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users';");
      console.log('\nUpdated columns:');
      console.log(verify.rows.map(r => r.column_name));
    }
  } catch (err) {
    console.error('❌ Database error:', err);
  } finally {
    if (pool) await pool.end();
  }
}

checkSchema();
