require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../src/config/db');
const followController = require('../src/modules/follow/follow.controller');
const followService = require('../src/modules/follow/follow.service');
const followModel = require('../src/modules/follow/follow.model');

// Helper to mock Express req, res, next
function mockReqRes(overrides = {}) {
  let resStatus = 200;
  let resData = null;
  const res = {
    status(s) {
      resStatus = s;
      return this;
    },
    json(data) {
      resData = data;
      return this;
    }
  };
  const req = {
    user: overrides.user || {},
    params: overrides.params || {},
    query: overrides.query || {},
    body: overrides.body || {}
  };
  const next = (err) => {
    if (err) resData = { error: err.message, status: err.statusCode || 500 };
  };

  return { req, res, next, getResponse: () => ({ status: resStatus, data: resData }) };
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING FITCONNECT FOLLOW MODULE TEST SUITE (13 TESTS)');
  console.log('═══════════════════════════════════════════════════════════\n');

  let testUserA, testUserB, testUserC, testUserPrivate, testUserColdStart;
  let sportId1, sportId2;

  try {
    // 0. Setup test fixtures
    console.log('--- Setting up test users and data ---');

    // Fetch existing sports
    const sportsRes = await query('SELECT id FROM sports LIMIT 2;');
    if (sportsRes.rows.length >= 2) {
      sportId1 = sportsRes.rows[0].id;
      sportId2 = sportsRes.rows[1].id;
    } else {
      const s1 = await query("INSERT INTO sports (slug, name) VALUES ('test_sport_1', 'Test Sport 1') ON CONFLICT (slug) DO UPDATE SET name='Test Sport 1' RETURNING id;");
      const s2 = await query("INSERT INTO sports (slug, name) VALUES ('test_sport_2', 'Test Sport 2') ON CONFLICT (slug) DO UPDATE SET name='Test Sport 2' RETURNING id;");
      sportId1 = s1.rows[0].id;
      sportId2 = s2.rows[0].id;
    }

    const testSuffix = Math.random().toString(36).substring(2, 7);

    // Create Test User A (Follower) - gold, advanced, non_veg
    const uARes = await query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, tier, privacy)
      VALUES ('Test User A', 't_user_a_${testSuffix}', 't_a_${testSuffix}@example.com', 25, 70, 175, 'male', 'advanced', 'gym', 45, 'non_veg', 'gold', 'public')
      RETURNING id, username, tier, activity_level, diet_preference;
    `);
    testUserA = uARes.rows[0];

    // Create Test User B (High Match Target - shares 2 sports, same tier gold, same activity advanced, same diet non_veg)
    const uBRes = await query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, tier, privacy)
      VALUES ('Test User B', 't_user_b_${testSuffix}', 't_b_${testSuffix}@example.com', 26, 75, 180, 'male', 'advanced', 'gym', 45, 'non_veg', 'gold', 'public')
      RETURNING id, username;
    `);
    testUserB = uBRes.rows[0];

    // Create Test User C (Medium Match Target - shares 1 sport, silver tier, intermediate activity, veg diet)
    const uCRes = await query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, tier, privacy)
      VALUES ('Test User C Robert', 'robert_c_${testSuffix}', 't_c_${testSuffix}@example.com', 27, 80, 182, 'male', 'intermediate', 'gym', 45, 'veg', 'silver', 'public')
      RETURNING id, username;
    `);
    testUserC = uCRes.rows[0];

    // Create Test User Private (Should never appear in search/recommendations)
    const uPRes = await query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, tier, privacy)
      VALUES ('Private User', 'robert_p_${testSuffix}', 't_p_${testSuffix}@example.com', 28, 80, 182, 'female', 'advanced', 'gym', 45, 'non_veg', 'gold', 'private')
      RETURNING id, username;
    `);
    testUserPrivate = uPRes.rows[0];

    // Create Test User Cold Start (no sports assigned at all)
    const uColdRes = await query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, tier, privacy)
      VALUES ('Cold Start User', 'cold_user_${testSuffix}', 't_cold_${testSuffix}@example.com', 30, 65, 170, 'male', 'beginner', 'home', 30, 'vegan', 'bronze', 'public')
      RETURNING id, username;
    `);
    testUserColdStart = uColdRes.rows[0];

    // Assign sports: User A -> sport1, sport2; User B -> sport1, sport2; User C -> sport1
    await query(`INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2), ($1, $3);`, [testUserA.id, sportId1, sportId2]);
    await query(`INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2), ($1, $3);`, [testUserB.id, sportId1, sportId2]);
    await query(`INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2);`, [testUserC.id, sportId1]);
    await query(`INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2), ($1, $3);`, [testUserPrivate.id, sportId1, sportId2]);

    console.log('✅ Fixtures created successfully.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 1: POST /social/follow/:userId valid follow
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        params: { userId: testUserB.id }
      });
      await followController.follow(req, res, next);
      const resp = getResponse();
      const dbCheck = await query('SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2;', [testUserA.id, testUserB.id]);
      
      const pass = resp.status === 200 && resp.data?.data?.following === true && dbCheck.rowCount === 1;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 1: POST /social/follow/:userId with valid target user`);
      if (!pass) console.error('Details:', { resp, dbRowCount: dbCheck.rowCount });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Self-follow attempt -> CANNOT_FOLLOW_SELF (400)
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        params: { userId: testUserA.id }
      });
      await followController.follow(req, res, next);
      const resp = getResponse();
      const pass = resp.status === 400 && resp.data?.error?.code === 'CANNOT_FOLLOW_SELF';
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 2: Attempt to follow yourself -> CANNOT_FOLLOW_SELF, status 400`);
      if (!pass) console.error('Details:', resp);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Follow same user twice in a row (idempotency)
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        params: { userId: testUserB.id }
      });
      await followController.follow(req, res, next);
      const resp = getResponse();
      const dbCheck = await query('SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2;', [testUserA.id, testUserB.id]);
      const pass = resp.status === 200 && dbCheck.rowCount === 1;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 3: Follow same user twice -> Idempotent, no error, 1 row exists`);
      if (!pass) console.error('Details:', { resp, dbRowCount: dbCheck.rowCount });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: DELETE /social/follow/:userId -> row removed
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        params: { userId: testUserB.id }
      });
      await followController.unfollow(req, res, next);
      const resp = getResponse();
      const dbCheck = await query('SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2;', [testUserA.id, testUserB.id]);
      const pass = resp.status === 200 && resp.data?.data?.following === false && dbCheck.rowCount === 0;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 4: DELETE /social/follow/:userId -> row removed`);
      if (!pass) console.error('Details:', { resp, dbRowCount: dbCheck.rowCount });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Unfollow user never followed -> idempotent no error
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        params: { userId: testUserC.id }
      });
      await followController.unfollow(req, res, next);
      const resp = getResponse();
      const pass = resp.status === 200 && resp.data?.data?.following === false;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 5: Unfollow user not followed -> Idempotent, no error`);
      if (!pass) console.error('Details:', resp);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 6: GET followers and following lists ordered recent first
    // ─────────────────────────────────────────────────────────────
    {
      // Setup: A follows C, B follows C
      await followModel.createFollow(testUserA.id, testUserC.id);
      await new Promise(r => setTimeout(r, 60));
      await followModel.createFollow(testUserB.id, testUserC.id);

      // Check C's followers (should be [B, A])
      const { req: reqFollowers, res: resFollowers, next: nextFollowers, getResponse: getRespFollowers } = mockReqRes({
        user: { id: testUserC.id }
      });
      await followController.getFollowers(reqFollowers, resFollowers, nextFollowers);
      const followersResp = getRespFollowers();
      const followers = followersResp.data?.data || [];
      const followersCorrect = followers.length >= 2 && followers[0].id === testUserB.id && followers[1].id === testUserA.id;

      // Check A's following (should contain C)
      const { req: reqFollowing, res: resFollowing, next: nextFollowing, getResponse: getRespFollowing } = mockReqRes({
        user: { id: testUserA.id }
      });
      await followController.getFollowing(reqFollowing, resFollowing, nextFollowing);
      const followingResp = getRespFollowing();
      const following = followingResp.data?.data || [];
      const followingCorrect = following.some(u => u.id === testUserC.id);

      const pass = followersCorrect && followingCorrect;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 6: GET followers and following lists ordered by created_at DESC`);
      if (!pass) console.error('Details:', { followers, following });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 7: GET /social/follow/search?q=ro case-insensitive & public only
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        query: { q: 'RO' } // Uppercase to test case-insensitivity
      });
      await followController.search(req, res, next);
      const resp = getResponse();
      const results = resp.data?.data || [];
      const foundPublic = results.some(u => u.id === testUserC.id);
      const hiddenPrivate = !results.some(u => u.id === testUserPrivate.id);
      const pass = resp.status === 200 && foundPublic && hiddenPrivate;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 7: GET search?q=ro matches case-insensitively & only public`);
      if (!pass) console.error('Details:', { results, foundPublic, hiddenPrivate });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 8: GET /social/follow/search?q=a single character -> QUERY_TOO_SHORT (400)
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id },
        query: { q: 'a' }
      });
      await followController.search(req, res, next);
      const resp = getResponse();
      const pass = resp.status === 400 && resp.data?.error?.code === 'QUERY_TOO_SHORT';
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 8: GET search?q=a (single char) -> QUERY_TOO_SHORT, 400 status`);
      if (!pass) console.error('Details:', resp);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 9: GET /social/follow/recommendations ranked by score
    // ─────────────────────────────────────────────────────────────
    {
      // Reset follows for testUserA so B and C can be recommended
      await query('DELETE FROM follows WHERE follower_id = $1;', [testUserA.id]);

      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserA.id }
      });
      await followController.getRecommendations(req, res, next);
      const resp = getResponse();
      const recs = resp.data?.data || [];
      
      // User B has: 2 sports (80) + tier gold (25) + activity advanced (15) + diet non_veg (5) = 125
      // User C has: 1 sport (40) + tier silver (0) + activity intermediate (0) + diet veg (0) = 40
      const bIndex = recs.findIndex(u => u.id === testUserB.id);
      const cIndex = recs.findIndex(u => u.id === testUserC.id);
      
      const pass = bIndex !== -1 && (cIndex === -1 || bIndex < cIndex);
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 9: Recommendations ranking -> Highest score user (Test User B) appears first`);
      if (!pass) console.error('Details:', { recs, bIndex, cIndex });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 10: GET recommendations for cold start user -> fallback results returned
    // ─────────────────────────────────────────────────────────────
    {
      const { req, res, next, getResponse } = mockReqRes({
        user: { id: testUserColdStart.id }
      });
      await followController.getRecommendations(req, res, next);
      const resp = getResponse();
      const recs = resp.data?.data || [];
      const pass = resp.status === 200 && Array.isArray(recs) && recs.length > 0;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 10: Cold-start recommendations -> Fallback returned, non-empty`);
      if (!pass) console.error('Details:', { resp, count: recs.length });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Confirm private user never appears in search or recommendations
    // ─────────────────────────────────────────────────────────────
    {
      // Search check
      const searchRes = await followModel.searchByUsername('robert_p', testUserA.id);
      const inSearch = searchRes.some(u => u.id === testUserPrivate.id);

      // Recommendations check
      const recsRes = await followService.getRecommendations(testUserA.id);
      const inRecs = recsRes.some(u => u.id === testUserPrivate.id);

      const pass = !inSearch && !inRecs;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 11: Private user never appears in search or recommendations`);
      if (!pass) console.error('Details:', { inSearch, inRecs });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Confirm controller uses sendSuccess/sendError (no raw res.json)
    // ─────────────────────────────────────────────────────────────
    {
      const controllerCode = fs.readFileSync(path.join(__dirname, '../src/modules/follow/follow.controller.js'), 'utf-8');
      const hasRawResJson = /res\.json\(/.test(controllerCode);
      const usesSendSuccess = controllerCode.includes('sendSuccess(');
      const usesSendError = controllerCode.includes('sendError(');
      const pass = !hasRawResJson && usesSendSuccess && usesSendError;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 12: Controller uses sendSuccess/sendError without raw res.json()`);
      if (!pass) console.error('Details:', { hasRawResJson, usesSendSuccess, usesSendError });
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 13: Confirm follow.service.js contains NO notification calls
    // ─────────────────────────────────────────────────────────────
    {
      const serviceCode = fs.readFileSync(path.join(__dirname, '../src/modules/follow/follow.service.js'), 'utf-8');
      const hasNotificationCall = /notification/i.test(serviceCode);
      const pass = !hasNotificationCall;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 13: Service contains NO notification calls or imports`);
      if (!pass) console.error('Details:', { hasNotificationCall });
    }

    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('🎉 ALL 13 TEST SUITE CHECKS COMPLETED!');
    console.log('─────────────────────────────────────────────────────────────\n');

  } catch (err) {
    console.error('❌ Test suite encountered error:', err);
  } finally {
    // Cleanup fixtures
    console.log('--- Cleaning up test fixtures ---');
    try {
      const userIds = [testUserA?.id, testUserB?.id, testUserC?.id, testUserPrivate?.id, testUserColdStart?.id].filter(Boolean);
      if (userIds.length > 0) {
        await query(`DELETE FROM follows WHERE follower_id = ANY($1::uuid[]) OR following_id = ANY($1::uuid[]);`, [userIds]);
        await query(`DELETE FROM user_sports WHERE user_id = ANY($1::uuid[]);`, [userIds]);
        await query(`DELETE FROM users WHERE id = ANY($1::uuid[]);`, [userIds]);
      }
      console.log('✅ Cleanup completed.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup error:', cleanupErr.message);
    }

    if (pool) await pool.end();
  }
}

runTests();
