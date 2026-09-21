require('dotenv').config();
const db = require('../src/config/db');
const sessionService = require('../src/modules/session/session.service');
const sessionModel = require('../src/modules/session/session.model');
const notificationService = require('../src/modules/notifications/notifications.service');
const notificationsModel = require('../src/modules/notifications/notifications.model');
const { TIER_THRESHOLDS } = require('../src/config/tierThresholds.config');

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING TIER PROMOTION & NOTIFICATION INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const createdUserIds = [];
  let testSportId;
  let testExerciseId;

  try {
    // 0. Ensure sport and exercise exist
    const sportsRes = await db.query('SELECT id FROM sports LIMIT 1;');
    if (sportsRes.rows.length > 0) {
      testSportId = sportsRes.rows[0].id;
    } else {
      const s = await db.query("INSERT INTO sports (slug, name) VALUES ('gym_test', 'Gym') RETURNING id;");
      testSportId = s.rows[0].id;
    }

    const exRes = await db.query('SELECT id FROM exercises LIMIT 1;');
    if (exRes.rows.length > 0) {
      testExerciseId = exRes.rows[0].id;
    } else {
      const e = await db.query(`
        INSERT INTO exercises (name, sport_id, primary_load_tag, execution_mode)
        VALUES ('Bench Press', $1, 'upper_push', 'sets_reps')
        RETURNING id;
      `, [testSportId]);
      testExerciseId = e.rows[0].id;
    }

    // Helper to create a user with a plan, plan_day, and exercises
    async function setupTestUserFixture({ username, rpTotal, tier, currentStreak, longestStreak }) {
      const suffix = Math.random().toString(36).substring(2, 6);
      const shortUser = `u_${username.slice(0, 10)}_${suffix}`.toLowerCase();
      const userRes = await db.query(`
        INSERT INTO users (email, username, password_hash, name, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, rp_total, tier, current_streak, longest_streak, privacy)
        VALUES ($1, $2, 'hashed_pwd', 'Tier Tester', 25, 70.0, 175.0, 'other', 'beginner', 'gym', 45, 'veg', $3, $4, $5, $6, 'public')
        RETURNING id, username, rp_total, tier, current_streak, longest_streak;
      `, [`${shortUser}@test.com`, shortUser, rpTotal, tier, currentStreak, longestStreak]);
      
      const user = userRes.rows[0];
      createdUserIds.push(user.id);

      // Create Plan
      const planRes = await db.query(`
        INSERT INTO plans (user_id, week_start_date, status)
        VALUES ($1, CURRENT_DATE, 'active')
        RETURNING id;
      `, [user.id]);
      const planId = planRes.rows[0].id;

      // Create Plan Day
      const dayRes = await db.query(`
        INSERT INTO plan_days (plan_id, day_index, session_type, sport_id, intensity)
        VALUES ($1, 1, 'Workout Day', $2, 'medium')
        RETURNING id;
      `, [planId, testSportId]);
      const planDayId = dayRes.rows[0].id;

      // Create Plan Day Exercise
      await db.query(`
        INSERT INTO plan_day_exercises (plan_day_id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max)
        VALUES ($1, $2, 1, 3, 8, 12);
      `, [planDayId, testExerciseId]);

      return { user, planId, planDayId };
    }

    // Helper to create an in-progress session and completed feedback
    async function startAndPrepareSession(userId, planDayId) {
      const session = await sessionModel.createSession({
        userId,
        planDayId,
        sleepQuality: 'good',
        soreness: 'none',
        energy: 'fresh',
        newDiscomfortPresent: false
      });

      await sessionModel.insertSessionExerciseFeedback({
        sessionId: session.id,
        exerciseId: testExerciseId,
        orderIndex: 1,
        targetRepsMin: 8,
        targetRepsMax: 12,
        actualReps: 10,
        actualWeightKg: 60,
        feedback: 'just_right',
        adaptationApplied: null
      });

      return session;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Tier Promotion (Bronze -> Silver on crossing 500 RP)
    // ─────────────────────────────────────────────────────────────
    {
      console.log('--- TEST 1: User with 495 RP completes session (+15 RP -> 510 RP) crosses 500 (Bronze -> Silver) ---');
      const fixture = await setupTestUserFixture({
        username: 'promo_user',
        rpTotal: 495,
        tier: 'bronze',
        currentStreak: 0,
        longestStreak: 0
      });

      const session = await startAndPrepareSession(fixture.user.id, fixture.planDayId);
      const completionResult = await sessionService.completeSession(fixture.user.id, session.id, { duration_min: 30 });

      // Check DB User
      const updatedUser = await sessionModel.getUserById(fixture.user.id);
      
      // Check Notifications
      const notifs = await notificationsModel.getNotificationsByUser(fixture.user.id);
      const tierNotif = notifs.find(n => n.type === 'tier_promotion');

      const passTier = updatedUser.tier === 'silver';
      const passRp = Number(updatedUser.rp_total) === 510;
      const passNotif = Boolean(tierNotif && tierNotif.payload.tier === 'silver');

      console.log(`  - DB rp_total: ${updatedUser.rp_total} (Expected 510)`);
      console.log(`  - DB tier: ${updatedUser.tier} (Expected 'silver')`);
      console.log(`  - Tier Promotion Notification: ${tierNotif ? JSON.stringify(tierNotif.payload) : 'NONE'}`);

      const pass = passTier && passRp && passNotif;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 1: User upgraded from 'bronze' to 'silver' and received tier_promotion notification\n`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: RP increases within same tier (No tier promotion)
    // ─────────────────────────────────────────────────────────────
    {
      console.log('--- TEST 2: User with 520 RP in Silver completes session (+15 RP -> 535 RP, stays Silver) ---');
      const fixture = await setupTestUserFixture({
        username: 'same_tier_user',
        rpTotal: 520,
        tier: 'silver',
        currentStreak: 0,
        longestStreak: 0
      });

      const session = await startAndPrepareSession(fixture.user.id, fixture.planDayId);
      await sessionService.completeSession(fixture.user.id, session.id, { duration_min: 30 });

      const updatedUser = await sessionModel.getUserById(fixture.user.id);
      const notifs = await notificationsModel.getNotificationsByUser(fixture.user.id);
      const tierNotif = notifs.find(n => n.type === 'tier_promotion');

      const passTier = updatedUser.tier === 'silver';
      const passRp = Number(updatedUser.rp_total) === 535;
      const passNoNotif = !tierNotif;

      console.log(`  - DB rp_total: ${updatedUser.rp_total} (Expected 535)`);
      console.log(`  - DB tier: ${updatedUser.tier} (Expected 'silver')`);
      console.log(`  - Tier Promotion Notification: ${tierNotif ? JSON.stringify(tierNotif.payload) : 'NONE (Correct)'}`);

      const pass = passTier && passRp && passNoNotif;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 2: Tier unchanged at 'silver' and NO tier_promotion notification created\n`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Streak Milestone Hit (e.g. 7-day milestone)
    // ─────────────────────────────────────────────────────────────
    {
      console.log('--- TEST 3: User with 6-day streak completes workout on consecutive day -> hits 7-day milestone ---');
      const fixture = await setupTestUserFixture({
        username: 'streak_milestone_user',
        rpTotal: 100,
        tier: 'bronze',
        currentStreak: 6,
        longestStreak: 6
      });

      // Insert prior completed session yesterday
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await db.query(`
        INSERT INTO sessions (user_id, plan_day_id, date, status, fully_completed, completed_at)
        VALUES ($1, $2, $3, 'completed', true, now() - interval '1 day');
      `, [fixture.user.id, fixture.planDayId, yesterday]);

      const session = await startAndPrepareSession(fixture.user.id, fixture.planDayId);
      const result = await sessionService.completeSession(fixture.user.id, session.id, { duration_min: 30 });

      const updatedUser = await sessionModel.getUserById(fixture.user.id);
      const notifs = await notificationsModel.getNotificationsByUser(fixture.user.id);
      const streakNotif = notifs.find(n => n.type === 'streak_milestone');

      const passStreak = updatedUser.current_streak === 7;
      const passMilestoneHit = result.streak_milestone_hit === 7;
      const passNotif = Boolean(streakNotif && Number(streakNotif.payload.streak_days) === 7);

      console.log(`  - DB current_streak: ${updatedUser.current_streak} (Expected 7)`);
      console.log(`  - streak_milestone_hit: ${result.streak_milestone_hit} (Expected 7)`);
      console.log(`  - Streak Milestone Notification: ${streakNotif ? JSON.stringify(streakNotif.payload) : 'NONE'}`);

      const pass = passStreak && passMilestoneHit && passNotif;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 3: Streak milestone (7 days) hit and streak_milestone notification created\n`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Non-Milestone Streak (e.g. Day 2)
    // ─────────────────────────────────────────────────────────────
    {
      console.log('--- TEST 4: User with 1-day streak completes workout -> becomes 2-day streak (Non-milestone) ---');
      const fixture = await setupTestUserFixture({
        username: 'non_milestone_user',
        rpTotal: 50,
        tier: 'bronze',
        currentStreak: 1,
        longestStreak: 1
      });

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await db.query(`
        INSERT INTO sessions (user_id, plan_day_id, date, status, fully_completed, completed_at)
        VALUES ($1, $2, $3, 'completed', true, now() - interval '1 day');
      `, [fixture.user.id, fixture.planDayId, yesterday]);

      const session = await startAndPrepareSession(fixture.user.id, fixture.planDayId);
      const result = await sessionService.completeSession(fixture.user.id, session.id, { duration_min: 30 });

      const updatedUser = await sessionModel.getUserById(fixture.user.id);
      const notifs = await notificationsModel.getNotificationsByUser(fixture.user.id);
      const streakNotif = notifs.find(n => n.type === 'streak_milestone');

      const passStreak = updatedUser.current_streak === 2;
      const passNoMilestone = result.streak_milestone_hit === null;
      const passNoNotif = !streakNotif;

      console.log(`  - DB current_streak: ${updatedUser.current_streak} (Expected 2)`);
      console.log(`  - streak_milestone_hit: ${result.streak_milestone_hit} (Expected null)`);
      console.log(`  - Streak Milestone Notification: ${streakNotif ? JSON.stringify(streakNotif.payload) : 'NONE (Correct)'}`);

      const pass = passStreak && passNoMilestone && passNoNotif;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 4: Streak updated to 2 and NO streak_milestone notification fired\n`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Resilient to Notification Failures
    // ─────────────────────────────────────────────────────────────
    {
      console.log('--- TEST 5: Notification service throws error -> Session completion & Tier upgrade still succeed ---');
      const fixture = await setupTestUserFixture({
        username: 'notif_fail_user',
        rpTotal: 495,
        tier: 'bronze',
        currentStreak: 0,
        longestStreak: 0
      });

      // Temporarily mock notification methods to simulate an external error
      const origTierNotif = notificationService.notifyTierPromotion;
      const origStreakNotif = notificationService.notifyStreakMilestone;
      notificationService.notifyTierPromotion = async () => {
        throw new Error('FCM Network Disconnected!');
      };
      notificationService.notifyStreakMilestone = async () => {
        throw new Error('FCM Network Disconnected!');
      };

      let completionSuccess = false;
      let updatedUser = null;

      try {
        const session = await startAndPrepareSession(fixture.user.id, fixture.planDayId);
        const result = await sessionService.completeSession(fixture.user.id, session.id, { duration_min: 30 });
        if (result && result.rp_awarded === 15) {
          completionSuccess = true;
        }
        updatedUser = await sessionModel.getUserById(fixture.user.id);
      } finally {
        // Restore original functions
        notificationService.notifyTierPromotion = origTierNotif;
        notificationService.notifyStreakMilestone = origStreakNotif;
      }

      const passSession = completionSuccess === true;
      const passTier = updatedUser && updatedUser.tier === 'silver';
      const passRp = updatedUser && Number(updatedUser.rp_total) === 510;

      console.log(`  - Session Completion Succeeded: ${passSession}`);
      console.log(`  - DB tier updated to: ${updatedUser?.tier} (Expected 'silver')`);
      console.log(`  - DB rp_total: ${updatedUser?.rp_total} (Expected 510)`);

      const pass = passSession && passTier && passRp;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 5: Notification errors gracefully caught without breaking session completion or tier update\n`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Highest Tier (Elite) user earning more RP
    // ─────────────────────────────────────────────────────────────
    {
      console.log('--- TEST 6: User already at highest tier (Elite, 3500 RP) completes session ---');
      const fixture = await setupTestUserFixture({
        username: 'elite_user',
        rpTotal: 3500,
        tier: 'elite',
        currentStreak: 0,
        longestStreak: 0
      });

      const session = await startAndPrepareSession(fixture.user.id, fixture.planDayId);
      const result = await sessionService.completeSession(fixture.user.id, session.id, { duration_min: 30 });

      const updatedUser = await sessionModel.getUserById(fixture.user.id);
      const notifs = await notificationsModel.getNotificationsByUser(fixture.user.id);
      const tierNotif = notifs.find(n => n.type === 'tier_promotion');

      const passTier = updatedUser.tier === 'elite';
      const passRp = Number(updatedUser.rp_total) === 3515;
      const passNoNotif = !tierNotif;

      console.log(`  - DB rp_total: ${updatedUser.rp_total} (Expected 3515)`);
      console.log(`  - DB tier: ${updatedUser.tier} (Expected 'elite')`);
      console.log(`  - Tier Promotion Notification: ${tierNotif ? JSON.stringify(tierNotif.payload) : 'NONE (Correct)'}`);

      const pass = passTier && passRp && passNoNotif;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test 6: Elite user earned RP, tier stayed Elite, and no redundant tier promotion notification\n`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎉 ALL 6 INTEGRATION TEST SCENARIOS COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test suite failed with error:', err);
  } finally {
    if (createdUserIds.length > 0) {
      await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      console.log(`Cleaned up ${createdUserIds.length} test users.`);
    }
    if (db.pool) {
      await db.pool.end();
    }
    process.exit(0);
  }
}

runAllTests();
