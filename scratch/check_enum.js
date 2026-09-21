const db = require('../src/config/db');

async function checkEnum() {
  const res = await db.query(`
    SELECT e.enumlabel
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    WHERE t.typname = 'notification_type_enum';
  `);
  console.log('ENUM values in DB:', res.rows.map(r => r.enumlabel));
  process.exit(0);
}

checkEnum();
