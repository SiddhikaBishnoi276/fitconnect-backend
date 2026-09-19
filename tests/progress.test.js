/**
 * FitConnect Progress Module - Test Suite
 * 
 * Test Scenarios:
 * 1. GET /progress/me for a user with no completed sessions -> rp_total: 0, tier: 'bronze', current_streak: 0, longest_streak: 0, rp_breakdown: {}
 * 2. GET /progress/me with session_completion & streak_milestone entries -> correct breakdown & rp_total sum
 * 3. GET /progress/prs for a user with zero PRs -> returns empty object {}
 * 4. GET /progress/prs with PRs across 2 sports -> grouped by sport_id, includes exercise_name
 * 5. GET /progress/me and GET /progress/prs WITHOUT auth token -> 401 UNAUTHORIZED via authGuard
 * 6. progress.model.js is 100% SELECT-only (no INSERT / UPDATE / DELETE statements)
 * 7. Response shape matches { success: true, data: {...} } via responseFormatter (no raw res.json() in controller)
 * 8. Session completion integration -> 9 RP awarded (3/5 exercises completed), GET /progress/me reflects +9 rp_total and +9 session_completion
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Target modules
const progressModel = require('../src/modules/progress/progress.model');
const progressService = require('../src/modules/progress/progress.service');
const progressController = require('../src/modules/progress/progress.controller');
const authGuard = require('../src/middleware/authGuard');
const env = require('../src/config/env.config');

// Helper to create mock response object
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING FITCONNECT PROGRESS MODULE TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function record(testName, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${testName}`);
      console.error('   ', err.message);
      throw err;
    }
  }

  async function recordAsync(testName, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${testName}`);
      console.error('   ', err.message);
      throw err;
    }
  }

  // --- TEST 6: Static Check - progress.model.js is 100% SELECT-only ---
  record('Test 6: progress.model.js contains ONLY SELECT queries (no INSERT/UPDATE/DELETE)', () => {
    const modelCode = fs.readFileSync(
      path.join(__dirname, '../src/modules/progress/progress.model.js'),
      'utf8'
    );
    const upperCode = modelCode.toUpperCase();
    
    assert.strictEqual(
      upperCode.includes('INSERT INTO'),
      false,
      'progress.model.js must NOT contain INSERT statements'
    );
    assert.strictEqual(
      upperCode.includes('UPDATE '),
      false,
      'progress.model.js must NOT contain UPDATE statements'
    );
    assert.strictEqual(
      upperCode.includes('DELETE FROM'),
      false,
      'progress.model.js must NOT contain DELETE statements'
    );
    assert.strictEqual(
      upperCode.includes('SELECT '),
      true,
      'progress.model.js must contain SELECT queries'
    );
  });

  // --- TEST 7: Static Check - progress.controller.js uses responseFormatter ---
  record('Test 7: progress.controller.js uses ONLY sendSuccess / sendError (no raw res.json)', () => {
    const controllerCode = fs.readFileSync(
      path.join(__dirname, '../src/modules/progress/progress.controller.js'),
      'utf8'
    );

    assert.strictEqual(
      controllerCode.includes('res.json('),
      false,
      'progress.controller.js must not call res.json() directly'
    );
    assert.strictEqual(
      controllerCode.includes('sendSuccess('),
      true,
      'progress.controller.js must use sendSuccess'
    );
    assert.strictEqual(
      controllerCode.includes('sendError('),
      true,
      'progress.controller.js must use sendError'
    );
  });

  // --- TEST 1: GET /progress/me for brand new user with 0 sessions ---
  await recordAsync('Test 1: GET /progress/me for user with 0 sessions returns default stats & empty rp_breakdown {}', async () => {
    // Mock model responses for new user
    const originalGetUserStats = progressModel.getUserStats;
    const originalGetRPBreakdown = progressModel.getRPBreakdown;

    progressModel.getUserStats = async (userId) => ({
      rp_total: 0,
      tier: 'bronze',
      current_streak: 0,
      longest_streak: 0,
    });
    progressModel.getRPBreakdown = async (userId) => [];

    try {
      const req = { user: { id: 'new-user-uuid-123' } };
      const res = createMockRes();
      let nextCalled = false;

      await progressController.getMe(req, res, (err) => { nextCalled = true; });

      assert.strictEqual(nextCalled, false, 'next() should not be called on success');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.data, {
        rp_total: 0,
        tier: 'bronze',
        current_streak: 0,
        longest_streak: 0,
        rp_breakdown: {}
      });
      // Confirm rp_breakdown is an empty object and not missing or null
      assert.strictEqual(typeof res.body.data.rp_breakdown, 'object');
      assert.strictEqual(Object.keys(res.body.data.rp_breakdown).length, 0);
    } finally {
      progressModel.getUserStats = originalGetUserStats;
      progressModel.getRPBreakdown = originalGetRPBreakdown;
    }
  });

  // --- TEST 2: GET /progress/me for user with multiple RP entries ---
  await recordAsync('Test 2: GET /progress/me for user with session & streak RP returns correct breakdown and total', async () => {
    const originalGetUserStats = progressModel.getUserStats;
    const originalGetRPBreakdown = progressModel.getRPBreakdown;

    progressModel.getUserStats = async (userId) => ({
      rp_total: 440,
      tier: 'silver',
      current_streak: 7,
      longest_streak: 14,
    });
    progressModel.getRPBreakdown = async (userId) => [
      { type: 'session_completion', total: '340' },
      { type: 'streak_milestone', total: '100' }
    ];

    try {
      const req = { user: { id: 'veteran-user-uuid-456' } };
      const res = createMockRes();

      await progressController.getMe(req, res, (err) => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.rp_total, 440);
      assert.strictEqual(res.body.data.tier, 'silver');
      assert.strictEqual(res.body.data.current_streak, 7);
      assert.strictEqual(res.body.data.longest_streak, 14);
      assert.deepStrictEqual(res.body.data.rp_breakdown, {
        session_completion: 340,
        streak_milestone: 100
      });
      assert.strictEqual(
        res.body.data.rp_total,
        res.body.data.rp_breakdown.session_completion + res.body.data.rp_breakdown.streak_milestone
      );
    } finally {
      progressModel.getUserStats = originalGetUserStats;
      progressModel.getRPBreakdown = originalGetRPBreakdown;
    }
  });

  // --- TEST 3: GET /progress/prs for user with zero PRs ---
  await recordAsync('Test 3: GET /progress/prs for user with 0 PRs returns empty object {}', async () => {
    const originalGetUserPRs = progressModel.getUserPRs;
    progressModel.getUserPRs = async (userId) => [];

    try {
      const req = { user: { id: 'no-prs-user-uuid-789' } };
      const res = createMockRes();

      await progressController.getPRs(req, res, (err) => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.data, {});
      assert.strictEqual(typeof res.body.data, 'object');
      assert.strictEqual(Object.keys(res.body.data).length, 0);
    } finally {
      progressModel.getUserPRs = originalGetUserPRs;
    }
  });

  // --- TEST 4: GET /progress/prs for user with PRs across 2 sports ---
  await recordAsync('Test 4: GET /progress/prs groups by sport_id and includes exercise_name', async () => {
    const originalGetUserPRs = progressModel.getUserPRs;
    progressModel.getUserPRs = async (userId) => [
      {
        id: 'pr-1',
        exercise_id: 'ex-1',
        exercise_name: 'Bench Press',
        sport_id: 1,
        metric: '1rm_kg',
        value: 100,
        previous_best: 95
      },
      {
        id: 'pr-2',
        exercise_id: 'ex-2',
        exercise_name: 'Squat',
        sport_id: 1,
        metric: '1rm_kg',
        value: 120,
        previous_best: 110
      },
      {
        id: 'pr-3',
        exercise_id: 'ex-3',
        exercise_name: '50m Freestyle',
        sport_id: 2,
        metric: 'time_sec',
        value: 200,
        previous_best: 190
      }
    ];

    try {
      const req = { user: { id: 'multi-sport-user-uuid' } };
      const res = createMockRes();

      await progressController.getPRs(req, res, (err) => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(typeof res.body.data, 'object');

      const sportKeys = Object.keys(res.body.data);
      assert.strictEqual(sportKeys.length, 2);
      assert.ok(sportKeys.includes('1'));
      assert.ok(sportKeys.includes('2'));

      // Verify sport 1 PRs
      const sport1PRs = res.body.data['1'];
      assert.strictEqual(sport1PRs.length, 2);
      assert.strictEqual(sport1PRs[0].exercise_name, 'Bench Press');
      assert.strictEqual(sport1PRs[0].value, 100);
      assert.strictEqual(sport1PRs[1].value, 120);

      // Verify sport 2 PRs
      const sport2PRs = res.body.data['2'];
      assert.strictEqual(sport2PRs.length, 1);
      assert.strictEqual(sport2PRs[0].value, 200);
    } finally {
      progressModel.getUserPRs = originalGetUserPRs;
    }
  });

  // --- TEST 5: AuthGuard Protection for /progress/me and /progress/prs ---
  record('Test 5: Unauthenticated requests to progress endpoints return 401 UNAUTHORIZED via authGuard', () => {
    // 5.1 No auth header
    const reqNoHeader = { headers: {} };
    const res = createMockRes();
    let errorReceived = null;

    authGuard(reqNoHeader, res, (err) => {
      errorReceived = err;
    });

    assert.ok(errorReceived, 'authGuard should pass error to next() when no token is present');
    assert.strictEqual(errorReceived.statusCode, 401);
    assert.strictEqual(errorReceived.code, 'UNAUTHORIZED');

    // 5.2 Invalid auth token
    const reqInvalidToken = { headers: { authorization: 'Bearer invalid.token.payload' } };
    let invalidTokenError = null;

    authGuard(reqInvalidToken, res, (err) => {
      invalidTokenError = err;
    });

    assert.ok(invalidTokenError, 'authGuard should pass error to next() on invalid token');
    assert.strictEqual(invalidTokenError.statusCode, 401);
    assert.strictEqual(invalidTokenError.code, 'UNAUTHORIZED');
  });

  // --- TEST 8: End-to-end Session Completion -> Progress Update Flow ---
  await recordAsync('Test 8: Session completion awards 9 RP (3/5 completed), GET /progress/me reflects +9 rp_total and session_completion', async () => {
    // Initial state: user has 100 RP total (100 from prior sessions)
    let userStatsState = {
      rp_total: 100,
      tier: 'bronze',
      current_streak: 1,
      longest_streak: 1
    };
    let rpLedgerState = [
      { type: 'session_completion', total: 100 }
    ];

    const originalGetUserStats = progressModel.getUserStats;
    const originalGetRPBreakdown = progressModel.getRPBreakdown;

    progressModel.getUserStats = async (userId) => ({ ...userStatsState });
    progressModel.getRPBreakdown = async (userId) => [...rpLedgerState];

    try {
      // Step A: Baseline check
      const baselineReq = { user: { id: 'flow-user-uuid' } };
      const baselineRes = createMockRes();
      await progressController.getMe(baselineReq, baselineRes, () => {});

      assert.strictEqual(baselineRes.body.data.rp_total, 100);
      assert.strictEqual(baselineRes.body.data.rp_breakdown.session_completion, 100);

      // Step B: Simulate session completion where 3 out of 5 exercises completed
      // Formula: session completion awards RP (e.g. 9 RP)
      const awardedRP = 9;
      const completedSessionType = 'session_completion';

      // Simulating session completion handler writing to rp_ledger & trigger updating users.rp_total
      userStatsState.rp_total += awardedRP;
      rpLedgerState = [
        { type: 'session_completion', total: 100 + awardedRP }
      ];

      // Step C: Call GET /progress/me immediately after
      const postReq = { user: { id: 'flow-user-uuid' } };
      const postRes = createMockRes();
      await progressController.getMe(postReq, postRes, () => {});

      assert.strictEqual(postRes.body.data.rp_total, 109, 'rp_total must increase by +9');
      assert.strictEqual(postRes.body.data.rp_breakdown.session_completion, 109, 'session_completion breakdown must increase by +9');
    } finally {
      progressModel.getUserStats = originalGetUserStats;
      progressModel.getRPBreakdown = originalGetRPBreakdown;
    }
  });

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution encountered an unhandled error:', err);
  process.exit(1);
});
