const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env.config');

async function runTest() {
  const timestamp = Date.now();
  let userAId, userBId, userCId, userAToken;

  try {
    console.log('--- Starting Ranking API Test ---');

    // 1. Create dummy users in DB
    console.log('1. Creating test users in DB (with RP totals)...');
    
    // userA: Tier bronze, 100 RP
    const resA = await pool.query(
      `INSERT INTO users (username, name, email, tier, rp_total, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, privacy)
       VALUES ($1, 'User A (Current)', $2, 'bronze', 100, 25, 70, 175, 'male', 'beginner', 'gym', 30, 'public')
       RETURNING id;`,
      [`usera${timestamp}`, `usera.${timestamp}@test.com`]
    );
    userAId = resA.rows[0].id;

    // userB: Tier bronze, 200 RP
    const resB = await pool.query(
      `INSERT INTO users (username, name, email, tier, rp_total, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, privacy)
       VALUES ($1, 'User B (Friend)', $2, 'bronze', 200, 25, 70, 175, 'male', 'beginner', 'gym', 30, 'public')
       RETURNING id;`,
      [`userb${timestamp}`, `userb.${timestamp}@test.com`]
    );
    userBId = resB.rows[0].id;

    // userC: Tier bronze, 150 RP (Not followed by User A)
    const resC = await pool.query(
      `INSERT INTO users (username, name, email, tier, rp_total, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, privacy)
       VALUES ($1, 'User C (Stranger)', $2, 'bronze', 150, 25, 70, 175, 'male', 'beginner', 'gym', 30, 'public')
       RETURNING id;`,
      [`userc${timestamp}`, `userc.${timestamp}@test.com`]
    );
    userCId = resC.rows[0].id;

    // 2. Insert Follow (User A follows User B)
    console.log('2. Inserting follow relationship (A follows B)...');
    await pool.query(
      `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2);`,
      [userAId, userBId]
    );

    // 3. Generate token for User A
    userAToken = jwt.sign({ userId: userAId }, env.JWT_SECRET, { expiresIn: '1h' });

    // 4. Refresh Materialized View
    console.log('3. Refreshing materialized view (leaderboard_snapshot)...');
    try {
        await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_snapshot;`);
    } catch (e) {
        // Fallback without concurrently if it hasn't been populated
        await pool.query(`REFRESH MATERIALIZED VIEW leaderboard_snapshot;`);
    }

    // 5. Test Friends Scope
    console.log('\\n--- 4. Testing GET /api/v1/ranking/leaderboard?scope=friends ---');
    const friendsRes = await request(app)
      .get('/api/v1/ranking/leaderboard?scope=friends')
      .set('Authorization', `Bearer ${userAToken}`);
    
    if (!friendsRes.body.success) {
      console.error('❌ Friends Leaderboard Error:', friendsRes.body);
    } else {
      console.log('✅ Friends Leaderboard Data:');
      console.table(friendsRes.body.data.map(u => ({
          name: u.name,
          tier: u.tier,
          rp: u.rp_total,
          rank: u.rank
      })));
    }

    // 6. Test Global Scope
    console.log('\\n--- 5. Testing GET /api/v1/ranking/leaderboard?scope=global ---');
    const globalRes = await request(app)
      .get('/api/v1/ranking/leaderboard?scope=global')
      .set('Authorization', `Bearer ${userAToken}`);

    if (!globalRes.body.success) {
      console.error('❌ Global Leaderboard Error:', globalRes.body);
    } else {
      console.log('✅ Global Leaderboard Data (Filtered to current user tier):');
      // Just map a few top results to console to not overflow
      console.table(globalRes.body.data.slice(0, 5).map(u => ({
        name: u.name,
        tier: u.tier,
        rp: u.rp_total,
        tier_rank: u.rank,
        global_rank: u.global_rank
      })));
    }

  } catch (error) {
    console.error('Test script error:', error);
  } finally {
    console.log('\\nCleaning up...');
    pool.end();
  }
}

runTest();
