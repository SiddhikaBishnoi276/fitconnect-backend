/**
 * FitConnect Diet Module - Comprehensive Test Suite
 * Covers all 8 verification scenarios:
 * 1. POST /diet/generate on high-intensity planned day before session start -> pre/post-workout meals + heavy training insight
 * 2. POST /diet/generate on rest day (no exercises) -> no pre/post workout meals + rest day insight
 * 3. GET /diet/today -> returns saved plan with insight & hydration recomputed
 * 4. GET /diet/meals/:mealId -> ingredients & prep_simplicity on success, graceful { ingredients: null, prep_simplicity: null } on LLM failure/timeout
 * 5. POST /diet/generate twice -> diet_log_meals replaced, existing session_id preserved
 * 6. Post-plan session creation/linkage -> diet_logs.session_id backfilled without altering targets/meals
 * 7. GET /diet/history?days=7 -> returns partial history without error
 * 8. Controller response contract -> 100% adherence to sendSuccess / sendError
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Target modules
const dietInsights = require('../src/modules/diet/diet.insights');
const dietPrompts = require('../src/modules/diet/diet.prompts');
const dietModel = require('../src/modules/diet/diet.model');
const dietService = require('../src/modules/diet/diet.service');
const dietController = require('../src/modules/diet/diet.controller');
const sessionService = require('../src/modules/session/session.service');
const llmClient = require('../src/llm/llmClient');
const { sendSuccess, sendError } = require('../src/utils/responseFormatter');

// Mock response creator for controller tests
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
  console.log('🧪 RUNNING FITCONNECT DIET MODULE TESTS');
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

  // --- SCENARIO 8: Verify no raw res.json() in diet.controller.js ---
  record('Scenario 8: diet.controller.js uses ONLY sendSuccess / sendError (no raw res.json)', () => {
    const controllerCode = fs.readFileSync(
      path.join(__dirname, '../src/modules/diet/diet.controller.js'),
      'utf8'
    );
    // Check there are no occurrences of "res.json(" or "res.status(" inside diet.controller.js
    assert.strictEqual(
      controllerCode.includes('res.json('),
      false,
      'diet.controller.js must not call res.json() directly'
    );
    assert.strictEqual(
      controllerCode.includes('sendSuccess('),
      true,
      'diet.controller.js must use sendSuccess'
    );
    assert.strictEqual(
      controllerCode.includes('sendError('),
      true,
      'diet.controller.js must use sendError'
    );
  });

  // Setup in-memory mock database state
  let mockUsers = {
    'user-high-intensity': {
      id: 'user-high-intensity',
      weight_kg: 75,
      height_cm: 178,
      age: 26,
      gender: 'male',
      diet_preference: 'non_veg',
      regional_cuisine: 'South Indian'
    },
    'user-rest-day': {
      id: 'user-rest-day',
      weight_kg: 68,
      height_cm: 165,
      age: 24,
      gender: 'female',
      diet_preference: 'veg',
      regional_cuisine: 'North Indian'
    }
  };

  let mockPlannedTraining = {
    'user-high-intensity': {
      intensity: 'high',
      hasSessionToday: true,
      planDayId: 'pday-1'
    },
    'user-rest-day': {
      intensity: 'none',
      hasSessionToday: false,
      planDayId: 'pday-2'
    }
  };

  let mockSessions = {}; // Map of userId -> sessionId
  let mockDietLogs = {}; // Map of userId -> log object
  let mockDietMeals = {}; // Map of dietLogId -> Array of meals
  let nextMealId = 100;

  // Patch dietModel methods to use mock store for deterministic unit testing
  dietModel.getUserProfile = async (userId) => mockUsers[userId] || null;
  dietModel.getTodaysPlannedTraining = async (userId) => mockPlannedTraining[userId] || null;
  dietModel.getExistingSessionIdForToday = async (userId) => mockSessions[userId] || null;

  dietModel.saveDietPlan = async (userId, targets, meals, sessionId = null) => {
    const existingLog = mockDietLogs[userId];
    const logId = existingLog ? existingLog.id : `log-${userId}`;
    const finalSessionId = sessionId || (existingLog ? existingLog.session_id : null);

    mockDietLogs[userId] = {
      id: logId,
      user_id: userId,
      session_id: finalSessionId,
      date: new Date().toISOString().split('T')[0],
      ...targets
    };

    // Replace meals
    mockDietMeals[logId] = meals.map((m) => ({
      id: m.id || nextMealId++,
      diet_log_id: logId,
      slot: m.slot,
      name: m.name,
      cuisine: m.cuisine,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g
    }));

    return {
      date: mockDietLogs[userId].date,
      target_calories: mockDietLogs[userId].target_calories,
      target_protein_g: mockDietLogs[userId].target_protein_g,
      target_carbs_g: mockDietLogs[userId].target_carbs_g,
      target_fat_g: mockDietLogs[userId].target_fat_g,
      meals: mockDietMeals[logId]
    };
  };

  dietModel.linkSessionToDietLog = async (userId, date, sessionId) => {
    const log = mockDietLogs[userId];
    if (log && !log.session_id) {
      log.session_id = sessionId;
      return log;
    }
    return null;
  };

  dietModel.getDietPlanForDate = async (userId, date) => {
    const log = mockDietLogs[userId];
    if (!log) return null;
    return {
      ...log,
      meals: mockDietMeals[log.id] || []
    };
  };

  dietModel.getMealById = async (mealId) => {
    for (const meals of Object.values(mockDietMeals)) {
      const found = meals.find((m) => String(m.id) === String(mealId));
      if (found) return found;
    }
    return null;
  };

  dietModel.getDietLogsRange = async (userId, days) => {
    const log = mockDietLogs[userId];
    if (!log) return [];
    return [
      {
        date: log.date,
        target_protein_g: log.target_protein_g,
        target_carbs_g: log.target_carbs_g
      }
    ];
  };

  // Patch llmClient.generate to simulate AI response
  let llmShouldFail = false;
  let llmResponsePlan = null;
  let llmResponseMeal = null;

  llmClient.generate = async (system, user, options = {}) => {
    if (llmShouldFail) {
      throw new Error('LLM_TIMEOUT');
    }

    if (system.includes('sports-nutrition assistant')) {
      return { json: llmResponsePlan };
    }

    if (system.includes('reconstruct a plausible ingredient breakdown')) {
      return { json: llmResponseMeal };
    }

    return { text: 'ok' };
  };

  // --- SCENARIO 1: High intensity planned day with exercises scheduled before session start ---
  await recordAsync('Scenario 1: POST /diet/generate on high-intensity planned day (before training starts)', async () => {
    // LLM returns 5 meals including pre_workout and post_workout
    llmResponsePlan = {
      target_calories: 2800,
      target_protein_g: 170,
      target_carbs_g: 350,
      target_fat_g: 70,
      meals: [
        { slot: 'breakfast', name: 'Oatmeal & Eggs', cuisine: 'Continental', calories: 600, protein_g: 35, carbs_g: 75, fat_g: 15, ingredients: [{ name: 'Oats', grams: 80 }], prep_simplicity: 'easy' },
        { slot: 'pre_workout', name: 'Banana & Whey Toast', cuisine: 'Quick', calories: 350, protein_g: 25, carbs_g: 50, fat_g: 5, ingredients: [{ name: 'Banana', grams: 120 }], prep_simplicity: 'easy' },
        { slot: 'post_workout', name: 'Chicken Rice Bowl', cuisine: 'Indian', calories: 750, protein_g: 50, carbs_g: 100, fat_g: 15, ingredients: [{ name: 'Chicken Breast', grams: 200 }], prep_simplicity: 'medium' },
        { slot: 'lunch', name: 'Dal Roti Salad', cuisine: 'Indian', calories: 600, protein_g: 30, carbs_g: 80, fat_g: 18, ingredients: [{ name: 'Dal', grams: 150 }], prep_simplicity: 'medium' },
        { slot: 'dinner', name: 'Grilled Fish & Veggies', cuisine: 'Indian', calories: 500, protein_g: 30, carbs_g: 45, fat_g: 17, ingredients: [{ name: 'Fish', grams: 180 }], prep_simplicity: 'medium' }
      ]
    };

    const req = { user: { id: 'user-high-intensity' } };
    const res = createMockRes();

    await dietController.generate(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    const plan = res.body.data;

    // Check pre_workout and post_workout presence
    const slots = plan.meals.map(m => m.slot);
    assert.strictEqual(slots.includes('pre_workout'), true, 'Must include pre_workout meal');
    assert.strictEqual(slots.includes('post_workout'), true, 'Must include post_workout meal');

    // Check insight line
    assert.strictEqual(
      plan.insight,
      'Higher carbs today — heavy training session',
      'Must have high intensity insight'
    );
    assert.strictEqual(plan.hydration.target_liters, 3.5, 'Must have 3.5L hydration target');
  });

  // --- SCENARIO 2: Rest day (no exercises) ---
  await recordAsync('Scenario 2: POST /diet/generate on rest day (no exercises scheduled)', async () => {
    llmResponsePlan = {
      target_calories: 2000,
      target_protein_g: 130,
      target_carbs_g: 220,
      target_fat_g: 60,
      meals: [
        { slot: 'breakfast', name: 'Paneer Paratha & Curd', cuisine: 'Indian', calories: 550, protein_g: 25, carbs_g: 65, fat_g: 20, ingredients: [{ name: 'Paneer', grams: 100 }], prep_simplicity: 'medium' },
        { slot: 'lunch', name: 'Rajma Chawal', cuisine: 'Indian', calories: 650, protein_g: 30, carbs_g: 95, fat_g: 15, ingredients: [{ name: 'Rajma', grams: 150 }], prep_simplicity: 'medium' },
        { slot: 'snack', name: 'Greek Yogurt & Almonds', cuisine: 'Healthy', calories: 300, protein_g: 20, carbs_g: 20, fat_g: 15, ingredients: [{ name: 'Yogurt', grams: 150 }], prep_simplicity: 'easy' },
        { slot: 'dinner', name: 'Tofu Vegetable Stir Fry', cuisine: 'Asian', calories: 500, protein_g: 35, carbs_g: 40, fat_g: 18, ingredients: [{ name: 'Tofu', grams: 200 }], prep_simplicity: 'easy' }
      ]
    };

    const req = { user: { id: 'user-rest-day' } };
    const res = createMockRes();

    await dietController.generate(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    const plan = res.body.data;

    const slots = plan.meals.map(m => m.slot);
    assert.strictEqual(slots.includes('pre_workout'), false, 'Must NOT include pre_workout meal on rest day');
    assert.strictEqual(slots.includes('post_workout'), false, 'Must NOT include post_workout meal on rest day');

    assert.strictEqual(
      plan.insight,
      'Rest day — maintenance targets',
      'Must have rest day insight'
    );
    assert.strictEqual(plan.hydration.target_liters, 2.0, 'Must have 2.0L hydration target');
  });

  // --- SCENARIO 3: GET /diet/today right after generating ---
  await recordAsync('Scenario 3: GET /diet/today returns current plan with consistent insight/hydration', async () => {
    const req = { user: { id: 'user-high-intensity' } };
    const res = createMockRes();

    await dietController.getToday(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    const plan = res.body.data;

    assert.strictEqual(plan.has_plan, true);
    assert.strictEqual(plan.target_calories, 2800);
    assert.strictEqual(plan.insight, 'Higher carbs today — heavy training session');
    assert.strictEqual(plan.hydration.target_liters, 3.5);
  });

  // --- SCENARIO 4: GET /diet/meals/:mealId elaboration & fallback ---
  await recordAsync('Scenario 4: GET /diet/meals/:mealId success and graceful failure on LLM timeout', async () => {
    const testMeal = mockDietMeals['log-user-high-intensity'][0];

    // 4A: Normal success
    llmShouldFail = false;
    llmResponseMeal = {
      ingredients: [
        { name: 'Rolled Oats', grams: 80 },
        { name: 'Whole Eggs', grams: 120 },
        { name: 'Milk', grams: 100 }
      ],
      prep_simplicity: 'easy'
    };

    const reqSuccess = { params: { mealId: testMeal.id } };
    const resSuccess = createMockRes();

    await dietController.getMeal(reqSuccess, resSuccess, () => {});

    assert.strictEqual(resSuccess.statusCode, 200);
    assert.strictEqual(resSuccess.body.success, true);
    assert.strictEqual(Array.isArray(resSuccess.body.data.ingredients), true);
    assert.strictEqual(resSuccess.body.data.prep_simplicity, 'easy');

    // 4B: Simulated LLM timeout / failure
    llmShouldFail = true;
    const reqFail = { params: { mealId: testMeal.id } };
    const resFail = createMockRes();

    await dietController.getMeal(reqFail, resFail, () => {});

    assert.strictEqual(resFail.statusCode, 200, 'Must return 200 even when LLM elaboration fails');
    assert.strictEqual(resFail.body.success, true);
    assert.strictEqual(resFail.body.data.ingredients, null, 'Ingredients must be null on failure');
    assert.strictEqual(resFail.body.data.prep_simplicity, null, 'Prep simplicity must be null on failure');

    // Reset flag
    llmShouldFail = false;
  });

  // --- SCENARIO 5: POST /diet/generate twice in same day ---
  await recordAsync('Scenario 5: POST /diet/generate twice replaces old meals and preserves existing session_id', async () => {
    // Manually set an existing session_id on the log
    mockDietLogs['user-high-intensity'].session_id = 'session-1234';

    const countBefore = mockDietMeals['log-user-high-intensity'].length;

    // Generate again with a 4-meal plan
    llmResponsePlan = {
      target_calories: 2750,
      target_protein_g: 165,
      target_carbs_g: 340,
      target_fat_g: 70,
      meals: [
        { slot: 'breakfast', name: 'Smoothie Bowl', cuisine: 'Modern', calories: 500, protein_g: 30, carbs_g: 70, fat_g: 10 },
        { slot: 'pre_workout', name: 'Dates & Espresso', cuisine: 'Quick', calories: 250, protein_g: 10, carbs_g: 50, fat_g: 2 },
        { slot: 'post_workout', name: 'Protein Shake & Rice', cuisine: 'Clean', calories: 800, protein_g: 65, carbs_g: 110, fat_g: 12 },
        { slot: 'dinner', name: 'Paneer Tikka Salad', cuisine: 'Indian', calories: 600, protein_g: 35, carbs_g: 40, fat_g: 22 }
      ]
    };

    const req = { user: { id: 'user-high-intensity' } };
    const res = createMockRes();

    await dietController.generate(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    const newMealsCount = mockDietMeals['log-user-high-intensity'].length;
    assert.strictEqual(newMealsCount, 4, 'Old meals must be replaced, not appended (should have exactly 4 meals)');
    assert.strictEqual(
      mockDietLogs['user-high-intensity'].session_id,
      'session-1234',
      'Existing session_id must not be wiped'
    );
  });

  // --- SCENARIO 6: Create session for today AFTER diet plan already exists ---
  await recordAsync('Scenario 6: Create session after diet plan backfills diet_logs.session_id safely', async () => {
    // Create new user with plan but no session yet
    mockDietLogs['user-rest-day'].session_id = null;

    const createdSession = await sessionService.createSession('user-rest-day', {
      id: 'session-999',
      date: new Date().toISOString().split('T')[0],
      status: 'in_progress'
    });

    assert.strictEqual(createdSession.id, 'session-999');
    assert.strictEqual(
      mockDietLogs['user-rest-day'].session_id,
      'session-999',
      'diet_logs.session_id must be backfilled to session-999'
    );
    assert.strictEqual(
      mockDietLogs['user-rest-day'].target_calories,
      2000,
      'Targets must remain intact'
    );
  });

  // --- SCENARIO 7: GET /diet/history?days=7 with fewer days ---
  await recordAsync('Scenario 7: GET /diet/history returns available rows without erroring', async () => {
    const req = { user: { id: 'user-high-intensity' }, query: { days: '7' } };
    const res = createMockRes();

    await dietController.getHistory(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(Array.isArray(res.body.data), true);
    assert.strictEqual(res.body.data.length, 1, 'Returns available records');
  });

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test execution terminated with error:', err);
  process.exit(1);
});
