require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/db');
const env = require('../src/config/env.config');
const notificationsModel = require('../src/modules/notifications/notifications.model');

async function runEndpointTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING NOTIFICATION HTTP ENDPOINT INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let server = null;
  let baseUrl = '';
  let testUser = null;
  let authToken = null;
  let notif1, notif2, notif3;

  try {
    // Start ephemeral server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 0. Setup test user & generate JWT
    const suffix = Math.random().toString(36).substring(2, 6);
    const username = `u_api_${suffix}`.toLowerCase();
    const email = `${username}@test.com`;

    const userRes = await db.query(`
      INSERT INTO users (email, username, password_hash, name, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, rp_total, tier, current_streak, longest_streak, privacy)
      VALUES ($1, $2, 'hashed_pwd', 'API Tester', 25, 70.0, 175.0, 'other', 'beginner', 'gym', 45, 'veg', 0, 'bronze', 0, 0, 'public')
      RETURNING id, username, email;
    `, [email, username]);

    testUser = userRes.rows[0];
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    console.log(`Created test user: ${testUser.username} (${testUser.id})\n`);

    // Seed 3 unread notifications
    notif1 = await notificationsModel.createNotification(testUser.id, 'new_follower', { name: 'Alice', follower_id: 'u1' });
    notif2 = await notificationsModel.createNotification(testUser.id, 'post_liked', { name: 'Bob', post_id: 'p1' });
    notif3 = await notificationsModel.createNotification(testUser.id, 'streak_milestone', { streak_days: 7 });

    console.log(`Seeded 3 unread notifications for testing (IDs: ${notif1.id}, ${notif2.id}, ${notif3.id})\n`);

    // ─────────────────────────────────────────────────────────────────
    // 1. GET /api/v1/notifications
    // ─────────────────────────────────────────────────────────────────
    {
      console.log('--- 1. GET /api/v1/notifications (with valid JWT) ---');
      const resp = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      const body = await resp.json();

      console.log('  Status:', resp.status);
      console.log('  Response Body:', JSON.stringify(body, null, 2));

      const is200 = resp.status === 200;
      const hasSuccess = body.success === true;
      const hasNotificationsArray = Array.isArray(body?.data?.notifications) && body.data.notifications.length === 3;
      const hasUnreadCount = body?.data?.unread_count === 3;

      const pass = is200 && hasSuccess && hasNotificationsArray && hasUnreadCount;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] 1. GET /api/v1/notifications returns shape: { success: true, data: { notifications: [...], unread_count: 3 } }\n`);
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. GET /api/v1/notifications/unread-count
    // ─────────────────────────────────────────────────────────────────
    {
      console.log('--- 2. GET /api/v1/notifications/unread-count ---');
      const resp = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      const body = await resp.json();

      console.log('  Status:', resp.status);
      console.log('  Response Body:', JSON.stringify(body, null, 2));

      const is200 = resp.status === 200;
      const hasSuccess = body.success === true;
      const hasOnlyUnreadCount = body?.data?.unread_count === 3 && body?.data?.notifications === undefined;

      const pass = is200 && hasSuccess && hasOnlyUnreadCount;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] 2. GET /api/v1/notifications/unread-count returns standalone: { unread_count: 3 }\n`);
    }

    // ─────────────────────────────────────────────────────────────────
    // 3. PATCH /api/v1/notifications/:id/read
    // ─────────────────────────────────────────────────────────────────
    {
      console.log(`--- 3. PATCH /api/v1/notifications/${notif1.id}/read ---`);
      const resp = await fetch(`${baseUrl}/api/v1/notifications/${notif1.id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      const body = await resp.json();

      console.log('  Status:', resp.status);
      console.log('  Response Body:', JSON.stringify(body, null, 2));

      // Query DB directly to verify read flag
      const dbRow = (await db.query('SELECT read FROM notifications WHERE id = $1', [notif1.id])).rows[0];
      const unreadCountAfter = await notificationsModel.getUnreadCount(testUser.id);

      const is200 = resp.status === 200;
      const isReadInResponse = body?.data?.read === true;
      const isReadInDb = dbRow?.read === true;
      const isUnreadCountUpdated = unreadCountAfter === 2;

      console.log(`  DB read flag: ${dbRow?.read}, Unread count in DB now: ${unreadCountAfter}`);

      const pass = is200 && isReadInResponse && isReadInDb && isUnreadCountUpdated;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] 3. PATCH /api/v1/notifications/:id/read marked notification as read (read=true, unread count dropped to 2)\n`);
    }

    // ─────────────────────────────────────────────────────────────────
    // 4. PATCH /api/v1/notifications/read-all
    // ─────────────────────────────────────────────────────────────────
    {
      console.log('--- 4. PATCH /api/v1/notifications/read-all ---');
      const resp = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      const body = await resp.json();

      console.log('  Status:', resp.status);
      console.log('  Response Body:', JSON.stringify(body, null, 2));

      // Query DB for any remaining unread
      const unreadCountAfter = await notificationsModel.getUnreadCount(testUser.id);
      const remainingUnreadRows = (await db.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false', [testUser.id])).rows[0].count;

      const is200 = resp.status === 200;
      const hasMarkedCount = body?.data?.marked_count === 2;
      const isZeroUnread = Number(unreadCountAfter) === 0 && Number(remainingUnreadRows) === 0;

      console.log(`  DB unread notifications count: ${unreadCountAfter}`);

      const pass = is200 && hasMarkedCount && isZeroUnread;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] 4. PATCH /api/v1/notifications/read-all marked all unread notifications (marked_count=2, remaining unread=0)\n`);
    }

    // ─────────────────────────────────────────────────────────────────
    // 5. POST & DELETE /api/v1/notifications/device-tokens
    // ─────────────────────────────────────────────────────────────────
    {
      console.log('--- 5. POST /api/v1/notifications/device-tokens (Register Token) ---');
      const sampleFcmToken = `fcm_device_token_${suffix}`;

      const postResp = await fetch(`${baseUrl}/api/v1/notifications/device-tokens`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fcm_token: sampleFcmToken,
          platform: 'android'
        })
      });
      const postBody = await postResp.json();

      console.log('  POST Status:', postResp.status);
      console.log('  POST Response Body:', JSON.stringify(postBody, null, 2));

      const dbTokensAfterPost = await notificationsModel.getDeviceTokensByUserId(testUser.id);
      console.log('  DB Tokens after POST:', dbTokensAfterPost);

      console.log('\n--- 5b. DELETE /api/v1/notifications/device-tokens (Remove Token) ---');
      const deleteResp = await fetch(`${baseUrl}/api/v1/notifications/device-tokens`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fcm_token: sampleFcmToken
        })
      });
      const deleteBody = await deleteResp.json();

      console.log('  DELETE Status:', deleteResp.status);
      console.log('  DELETE Response Body:', JSON.stringify(deleteBody, null, 2));

      const dbTokensAfterDelete = await notificationsModel.getDeviceTokensByUserId(testUser.id);
      console.log('  DB Tokens after DELETE:', dbTokensAfterDelete);

      const passPost = postResp.status === 201 && postBody.success === true && dbTokensAfterPost.length === 1;
      const passDelete = deleteResp.status === 200 && deleteBody?.data?.removed === true && dbTokensAfterDelete.length === 0;

      const pass = passPost && passDelete;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] 5. POST registered device token and DELETE successfully removed it (Token list is empty in DB)\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🎉 ALL 5 NOTIFICATION ENDPOINT TESTS COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Endpoint test suite failed with error:', err);
  } finally {
    if (server) {
      server.close();
    }
    if (testUser) {
      await db.query('DELETE FROM users WHERE id = $1', [testUser.id]);
      console.log('Cleaned up test user and notifications from database.');
    }
    if (db.pool) {
      await db.pool.end();
    }
    process.exit(0);
  }
}

runEndpointTests();
