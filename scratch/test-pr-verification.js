const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env.config');

async function runTest() {
  const timestamp = Date.now();
  let testUserId = null;
  let accessToken = null;
  let exerciseId = null;

  try {
    console.log('--- Starting PR Verification API Test ---');

    // 1. Create a dummy user directly in DB
    console.log('1. Creating a test user in DB...');
    const userRes = await pool.query(
      `INSERT INTO users (username, name, email, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference)
       VALUES ($1, 'PR Tester', $2, 26, 72.0, 178.0, 'male', 'intermediate', 'gym', 45, 'veg')
       RETURNING id;`,
      [`tester${timestamp}`, `pr.tester.${timestamp}@fitconnect.test`]
    );
    testUserId = userRes.rows[0].id;

    // 2. Generate a token
    console.log('2. Generating a JWT token...');
    accessToken = jwt.sign({ userId: testUserId }, env.JWT_SECRET, { expiresIn: '1h' });

    // 3. Create a dummy exercise
    console.log('3. Creating a dummy exercise...');
    const sportRes = await pool.query(
      `INSERT INTO sports (slug, name) VALUES ('test_sport_${timestamp}', 'Test Sport') RETURNING id;`
    );
    const exRes = await pool.query(
      `INSERT INTO exercises (name, sport_id) VALUES ('Test Exercise', $1) RETURNING id;`,
      [sportRes.rows[0].id]
    );
    exerciseId = exRes.rows[0].id;

    // 4. Add PR manually
    console.log('4. Adding a PR manually...');
    const addPrRes = await request(app)
      .post('/api/v1/profile/records')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        exercise_id: exerciseId,
        metric: '1rm_kg',
        value: 100
      });
    
    if (!addPrRes.body.success) throw new Error('Add PR failed: ' + JSON.stringify(addPrRes.body));
    console.log('  -> PR added:', addPrRes.body.data);
    const prId = addPrRes.body.data.id;

    // 5. Vote on the PR (as the same user, just for testing)
    console.log('5. Voting on the PR (Genuine)...');
    const voteRes = await request(app)
      .post(`/api/v1/social/verification/prs/${prId}/vote`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ vote: 'genuine' });
    
    if (!voteRes.body.success) throw new Error('Vote failed: ' + JSON.stringify(voteRes.body));
    console.log('  -> Vote result:', voteRes.body.data);

    // 6. Fetch PRs and check verification status
    console.log('6. Fetching PRs to check verification status...');
    const getPrRes = await request(app)
      .get('/api/v1/profile/records')
      .set('Authorization', `Bearer ${accessToken}`);
    
    if (!getPrRes.body.success) throw new Error('Get PRs failed: ' + JSON.stringify(getPrRes.body));
    const prData = getPrRes.body.data.find(pr => pr.id === prId);
    console.log('  -> Verification Status in Response:', prData.verification_status);
    console.log('  -> Genuine Votes:', prData.genuine_votes);
    console.log('  -> Flag Votes:', prData.flag_votes);

    if (prData.verification_status === 'genuine') {
      console.log('✅ TEST PASSED: Status correctly computed as genuine based on votes.');
    } else {
      console.log('❌ TEST FAILED: Status is not genuine.');
    }
  } catch (error) {
    console.error('Test script error:', error);
  } finally {
    console.log('Cleaning up...');
    pool.end();
  }
}

runTest();
