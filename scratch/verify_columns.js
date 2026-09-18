require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function verify() {
  try {
    const res = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users';");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    if (pool) await pool.end();
  }
}

verify();
