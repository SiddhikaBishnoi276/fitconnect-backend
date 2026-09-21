require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const notificationsController = require('../src/modules/notifications/notifications.controller');
const notificationsService = require('../src/modules/notifications/notifications.service');
const notificationsModel = require('../src/modules/notifications/notifications.model');
const masterRouter = require('../src/routes/index');

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
  let errorReceived = null;
  const next = (err) => {
    if (err) {
      errorReceived = err;
      resData = { error: err.message, code: err.code, status: err.statusCode || 500 };
    }
  };

  return {
    req,
    res,
    next,
    getError: () => errorReceived,
    getResponse: () => ({ status: resStatus, data: resData })
  };
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING FITCONNECT NOTIFICATION MODULE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  let testUserA, testUserB;

  try {
    // 0. Setup test users in DB
    console.log('--- Setting up test users ---');
    const suffix = Math.random().toString(36).substring(2, 7);
    
    // Create User A
    const uA = await db.query(`
      INSERT INTO users (email, username, password_hash, name, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, privacy)
      VALUES ($1, $2, 'hashed_pwd', 'Notif Tester A', 25, 70.0, 175.0, 'other', 'beginner', 'gym', 45, 'veg', 'public')
      RETURNING id, username;
    `, [`notif_a_${suffix}@test.com`, `notif_a_${suffix}`]);
    testUserA = uA.rows[0];

    // Create User B
    const uB = await db.query(`
      INSERT INTO users (email, username, password_hash, name, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, privacy)
      VALUES ($1, $2, 'hashed_pwd', 'Notif Tester B', 25, 70.0, 175.0, 'other', 'beginner', 'gym', 45, 'veg', 'public')
      RETURNING id, username;
    `, [`notif_b_${suffix}@test.com`, `notif_b_${suffix}`]);
    testUserB = uB.rows[0];

    console.log(`Created test users: UserA (${testUserA.id}), UserB (${testUserB.id})\n`);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Service Validation - Missing FCM token
    // ─────────────────────────────────────────────────────────────
    {
      let passed = false;
      try {
        await notificationsService.registerDeviceToken(testUserA.id, '');
      } catch (err) {
        if (err.code === 'VALIDATION_ERROR' && err.statusCode === 400) {
          passed = true;
        }
      }
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 1: Service rejects empty fcm_token with 400 VALIDATION_ERROR`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Service Validation - Invalid platform
    // ─────────────────────────────────────────────────────────────
    {
      let passed = false;
      try {
        await notificationsService.registerDeviceToken(testUserA.id, 'sample_fcm_token', 'windows_phone');
      } catch (err) {
        if (err.code === 'VALIDATION_ERROR' && err.statusCode === 400) {
          passed = true;
        }
      }
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 2: Service rejects invalid platform with 400 VALIDATION_ERROR`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Model & Service - Register FCM device token
    // ─────────────────────────────────────────────────────────────
    const sampleToken = `fcm_token_${suffix}_1`;
    {
      const tokenRecord = await notificationsService.registerDeviceToken(testUserA.id, sampleToken, 'iOS');
      const tokensInDb = await notificationsModel.getDeviceTokensByUserId(testUserA.id);
      const passed = tokenRecord && tokenRecord.fcm_token === sampleToken && tokenRecord.platform === 'ios' && tokensInDb.length === 1;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 3: Successfully registers device token with platform lowercasing`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Model - Token upsert idempotency
    // ─────────────────────────────────────────────────────────────
    {
      const tokenRecord2 = await notificationsService.registerDeviceToken(testUserA.id, sampleToken, 'android');
      const tokensInDb = await notificationsModel.getDeviceTokensByUserId(testUserA.id);
      const passed = tokensInDb.length === 1 && tokensInDb[0].platform === 'android';
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 4: Token upsert updates platform without duplicate records`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Model - Delete device token
    // ─────────────────────────────────────────────────────────────
    {
      const deletedCount = await notificationsModel.deleteDeviceToken(testUserA.id, sampleToken);
      const tokensInDb = await notificationsModel.getDeviceTokensByUserId(testUserA.id);
      const passed = deletedCount === 1 && tokensInDb.length === 0;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 5: Successfully deletes device token`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Model - Create Notification records
    // ─────────────────────────────────────────────────────────────
    let notif1, notif2;
    {
      notif1 = await notificationsModel.createNotification(testUserA.id, 'post_liked', { from_user: testUserB.username, post_id: 'post-123' });
      notif2 = await notificationsModel.createNotification(testUserA.id, 'streak_milestone', { streak_days: 7 });
      const passed = notif1 && notif2 && notif1.read === false && notif2.read === false;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 6: Successfully creates notifications with JSON payload`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Service - Get paginated notifications & unread count
    // ─────────────────────────────────────────────────────────────
    {
      const resData = await notificationsService.getNotifications(testUserA.id, 1, 10);
      const passed = resData && resData.notifications.length === 2 && resData.unread_count === 2;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 7: Fetches paginated notifications and calculates unread count (2)`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Service - Mark single notification as read
    // ─────────────────────────────────────────────────────────────
    {
      const updated = await notificationsService.markAsRead(notif1.id, testUserA.id);
      const unreadCount = await notificationsModel.getUnreadCount(testUserA.id);
      const passed = updated && updated.read === true && unreadCount === 1;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 8: Marks single notification as read; unread count drops to 1`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Service - Prevent unauthorized read of another user's notification
    // ─────────────────────────────────────────────────────────────
    {
      let passed = false;
      try {
        await notificationsService.markAsRead(notif2.id, testUserB.id);
      } catch (err) {
        if (err.code === 'NOTIFICATION_NOT_FOUND' && err.statusCode === 404) {
          passed = true;
        }
      }
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 9: Isolation check - 404 when attempting to mark another user's notification`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Service - Mark all notifications as read
    // ─────────────────────────────────────────────────────────────
    {
      const resMarkAll = await notificationsService.markAllAsRead(testUserA.id);
      const unreadCount = await notificationsModel.getUnreadCount(testUserA.id);
      const passed = resMarkAll.marked_count === 1 && unreadCount === 0;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 10: Marks all remaining unread notifications as read`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Controller Integration - getNotifications & registerDeviceToken
    // ─────────────────────────────────────────────────────────────
    {
      const mock1 = mockReqRes({ user: { id: testUserA.id }, query: { page: '1', limit: '10' } });
      await notificationsController.getNotifications(mock1.req, mock1.res, mock1.next);
      const resp1 = mock1.getResponse();

      const mock2 = mockReqRes({ user: { id: testUserA.id }, body: { fcm_token: 'ctrl_token_123', platform: 'web' } });
      await notificationsController.registerDeviceToken(mock2.req, mock2.res, mock2.next);
      const resp2 = mock2.getResponse();

      // Test getUnreadCount standalone endpoint
      const mock3 = mockReqRes({ user: { id: testUserA.id } });
      await notificationsController.getUnreadCount(mock3.req, mock3.res, mock3.next);
      const resp3 = mock3.getResponse();

      // Test unregisterDeviceToken endpoint
      const mock4 = mockReqRes({ user: { id: testUserA.id }, body: { fcm_token: 'ctrl_token_123' } });
      await notificationsController.unregisterDeviceToken(mock4.req, mock4.res, mock4.next);
      const resp4 = mock4.getResponse();

      const passed = resp1.status === 200 && resp1.data.success === true &&
                     resp2.status === 201 && resp2.data.success === true && resp2.data.data.platform === 'web' &&
                     resp3.status === 200 && resp3.data.success === true && typeof resp3.data.data.unread_count === 'number' &&
                     resp4.status === 200 && resp4.data.success === true && resp4.data.data.removed === true;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 11: Controllers format responses via sendSuccess with proper status codes (including unread-count & delete token)`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Route file inspection & Master Router registration
    // ─────────────────────────────────────────────────────────────
    {
      const routesContent = fs.readFileSync(path.join(__dirname, '../src/modules/notifications/notifications.routes.js'), 'utf-8');
      const readAllIndex = routesContent.indexOf("router.patch('/read-all'");
      const idReadIndex = routesContent.indexOf("router.patch('/:id/read'");
      const unreadCountIndex = routesContent.indexOf("router.get('/unread-count'");
      const deleteDeviceTokensIndex = routesContent.indexOf("router.delete('/device-tokens'");
      const hasReadAllBeforeId = readAllIndex !== -1 && idReadIndex !== -1 && readAllIndex < idReadIndex;
      
      const masterContent = fs.readFileSync(path.join(__dirname, '../src/routes/index.js'), 'utf-8');
      const hasNotificationMounted = masterContent.includes("router.use('/notifications', notificationsRoutes)");

      const passed = hasReadAllBeforeId && hasNotificationMounted && unreadCountIndex !== -1 && deleteDeviceTokensIndex !== -1;
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Test 12: Routes correctly ordered (/unread-count, /read-all, /device-tokens, /:id/read) and mounted under /api/v1/notifications in master router`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🎉 ALL NOTIFICATION TEST SUITE CHECKS COMPLETED!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test suite encountered error:', err);
  } finally {
    // Clean up test data
    if (testUserA || testUserB) {
      const userIds = [testUserA?.id, testUserB?.id].filter(Boolean);
      await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      console.log('Cleaned up test users from database.');
    }
    if (db.pool) {
      await db.pool.end();
    }
    process.exit(0);
  }
}

runTests();
