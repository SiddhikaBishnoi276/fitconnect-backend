require('dotenv').config();
const { pool, query } = require('../src/config/db');

async function runMigration() {
  try {
    console.log('--- Starting Migration ---');

    // 1. Column check
    console.log('1. Ensuring column username exists...');
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`);

    // 2. Backfill NULL or empty usernames
    console.log('2. Backfilling any NULL usernames...');
    const updateResult = await query(`
      UPDATE users 
      SET username = 'user_' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 8) 
      WHERE username IS NULL;
    `);
    console.log(`Backfilled rows: ${updateResult.rowCount}`);

    // 3. Drop existing unnamed/auto unique constraint if exists and add uq_users_username
    console.log('3. Setting UNIQUE constraint uq_users_username...');
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;`);
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_username;`);
    await query(`ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username);`);

    // 4. Set NOT NULL
    console.log('4. Setting username NOT NULL...');
    await query(`ALTER TABLE users ALTER COLUMN username SET NOT NULL;`);

    // 5. Add format check constraint
    console.log('5. Adding chk_username_format constraint...');
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_username_format;`);
    await query(`ALTER TABLE users ADD CONSTRAINT chk_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$');`);

    // 6. Indexes
    console.log('6. Creating indexes...');
    await query(`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_tier_activity ON users (tier, activity_level);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_sports_sport ON user_sports (sport_id);`);

    console.log('✅ All migration steps executed successfully!');

    // Verification
    console.log('\n--- VERIFYING CONSTRAINTS & INDEXES ---');
    const constraints = await query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint 
      WHERE conrelid = 'users'::regclass AND conname IN ('uq_users_username', 'chk_username_format');
    `);
    console.table(constraints.rows);

    const indexes = await query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename IN ('users', 'user_sports') 
        AND indexname IN ('idx_users_username_lower', 'idx_users_tier_activity', 'idx_user_sports_sport', 'uq_users_username');
    `);
    console.table(indexes.rows);

    const columns = await query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'username';
    `);
    console.table(columns.rows);

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    if (pool) await pool.end();
  }
}

runMigration();
