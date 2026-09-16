const request = require('supertest');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const { createNotification } = require('../src/modules/notifications/notifications.model');

describe('Notifications Module — Automated Integration Test Suite', () => {
  let user1Token = '';
  let user1Id = '';
  let user2Token = '';
  let user2Id = '';
  let dummyNotificationId = '';
  let user2NotificationId = '';

  const timestamp = Date.now();
  const testUser1 = {
    name: 'Notification Tester 1',
    email: `notif.tester1.${timestamp}@example.com`,
    password: 'Password@12345',
    age: 25,
    weight_kg: 70.0,
    height_cm: 175.0,
    gender: 'male',
    activity_level: 'beginner',
    equipment: 'gym',
    time_budget_minutes: 45,
    goals: ['fitness'],
    diet_preference: 'veg',
  };

  const testUser2 = {
    name: 'Notification Tester 2',
    email: `notif.tester2.${timestamp}@example.com`,
    password: 'Password@12345',
    age: 28,
    weight_kg: 65.0,
    height_cm: 168.0,
    gender: 'female',
    activity_level: 'intermediate',
    equipment: 'home',
    time_budget_minutes: 30,
    goals: ['endurance'],
    diet_preference: 'non_veg',
  };

  beforeAll(async () => {
    // 1. Signup & login User 1
    await request(app).post('/api/v1/auth/signup').send(testUser1);
    const login1Res = await request(app).post('/api/v1/auth/login').send({
      email: testUser1.email,
      password: testUser1.password,
    });
    user1Token = login1Res.body.data.accessToken;
    user1Id = login1Res.body.data.user.id;

    // 2. Signup & login User 2 (for cross-user security test)
    await request(app).post('/api/v1/auth/signup').send(testUser2);
    const login2Res = await request(app).post('/api/v1/auth/login').send({
      email: testUser2.email,
      password: testUser2.password,
    });
    user2Token = login2Res.body.data.accessToken;
    user2Id = login2Res.body.data.user.id;
  });

  afterAll(async () => {
    // Clean up test users and close DB pool
    try {
      if (user1Id) await query('DELETE FROM users WHERE id = $1', [user1Id]);
      if (user2Id) await query('DELETE FROM users WHERE id = $1', [user2Id]);
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }

    if (pool) {
      await pool.end();
    }
  });

  // 1. GET /notifications bina token -> 401
  test('1. GET /api/v1/notifications -> Fails with 401 Unauthorized without token', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 2. GET /notifications valid token -> 200, { notifications: [], unread_count: 0 }
  test('2. GET /api/v1/notifications -> Returns 200 with empty list and unread_count: 0 for new user', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.notifications)).toBe(true);
    expect(res.body.data.notifications).toHaveLength(0);
    expect(res.body.data.unread_count).toBe(0);
  });

  // 3. POST /notifications/device-tokens valid fcm_token + platform -> 201, token saved confirm karo
  test('3. POST /api/v1/notifications/device-tokens -> Successfully registers device token (201)', async () => {
    const tokenPayload = {
      fcm_token: `fcm_token_sample_${timestamp}`,
      platform: 'android',
    };

    const res = await request(app)
      .post('/api/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${user1Token}`)
      .send(tokenPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.fcm_token).toBe(tokenPayload.fcm_token);
    expect(res.body.data.platform).toBe('android');
    expect(res.body.data.user_id).toBe(user1Id);
  });

  // 4. POST /notifications/device-tokens missing fcm_token -> 400 VALIDATION_ERROR
  test('4. POST /api/v1/notifications/device-tokens -> Fails with 400 VALIDATION_ERROR when fcm_token is missing', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ platform: 'android' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/fcm_token is required/i);
  });

  // 5. POST /notifications/device-tokens invalid platform (jaise 'desktop') -> 400 VALIDATION_ERROR
  test('5. POST /api/v1/notifications/device-tokens -> Fails with 400 VALIDATION_ERROR when platform is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        fcm_token: `fcm_token_invalid_${timestamp}`,
        platform: 'desktop',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/Invalid platform/i);
  });

  // 6. POST /notifications/device-tokens SAME fcm_token dobara -> 201/200, no duplicate row in DB (upsert)
  test('6. POST /api/v1/notifications/device-tokens -> Same fcm_token does not create duplicate row (upsert check)', async () => {
    const sharedToken = `fcm_token_sample_${timestamp}`;

    // Re-send same token with updated platform 'ios'
    const res = await request(app)
      .post('/api/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        fcm_token: sharedToken,
        platform: 'ios',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.platform).toBe('ios');

    // Confirm in DB that exactly 1 row exists for this token and user
    const dbCheck = await query(
      'SELECT id, platform FROM device_tokens WHERE user_id = $1 AND fcm_token = $2',
      [user1Id, sharedToken]
    );
    expect(dbCheck.rows).toHaveLength(1);
    expect(dbCheck.rows[0].platform).toBe('ios');
  });

  // 7. Test setup me directly DB me ek dummy notification insert karo us user_id ke liye
  test('7. Notification flow: Insert dummy notification -> GET unread: 1 -> PATCH read -> GET unread: 0', async () => {
    // Direct DB insertion
    const createdNotif = await createNotification(user1Id, 'streak_milestone', { streak: 7 });
    dummyNotificationId = createdNotif.id;

    // 7a. GET /notifications -> ab wo notification array me aani chahiye, unread_count: 1
    const getBeforeRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(getBeforeRes.body.data.notifications).toHaveLength(1);
    expect(getBeforeRes.body.data.notifications[0].id).toBe(dummyNotificationId);
    expect(getBeforeRes.body.data.notifications[0].read).toBe(false);
    expect(getBeforeRes.body.data.unread_count).toBe(1);

    // 7b. PATCH /notifications/:id/read (sahi id se) -> 200, read: true confirm karo
    const markRes = await request(app)
      .patch(`/api/v1/notifications/${dummyNotificationId}/read`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(markRes.body.success).toBe(true);
    expect(markRes.body.data.id).toBe(dummyNotificationId);
    expect(markRes.body.data.read).toBe(true);

    // 7c. GET /notifications -> ab unread_count: 0
    const getAfterRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(getAfterRes.body.data.unread_count).toBe(0);
    expect(getAfterRes.body.data.notifications[0].read).toBe(true);
  });

  // 8. PATCH /notifications/:id/read kisi non-existent id se -> 404 NOTIFICATION_NOT_FOUND
  test('8. PATCH /api/v1/notifications/:id/read -> Fails with 404 NOTIFICATION_NOT_FOUND for non-existent ID', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .patch(`/api/v1/notifications/${nonExistentId}/read`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
  });

  // 9. PATCH /notifications/:id/read kisi doosre user ki notification id se -> 404 (security check)
  test('9. PATCH /api/v1/notifications/:id/read -> Cross-user security check: returns 404 when marking another user’s notification', async () => {
    // Create a notification for User 2
    const notifUser2 = await createNotification(user2Id, 'post_liked', { post_id: 'sample-post-123' });
    user2NotificationId = notifUser2.id;

    // User 1 tries to mark User 2's notification as read
    const res = await request(app)
      .patch(`/api/v1/notifications/${user2NotificationId}/read`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOTIFICATION_NOT_FOUND');

    // Confirm User 2's notification is STILL read: false in DB
    const checkDb = await query('SELECT read FROM notifications WHERE id = $1', [user2NotificationId]);
    expect(checkDb.rows[0].read).toBe(false);
  });

  // 10. PATCH /notifications/read-all -> 200, marked_count sahi aana chahiye jab multiple unread notifications hon
  test('10. PATCH /api/v1/notifications/read-all -> Successfully marks all unread notifications as read and returns marked_count (200)', async () => {
    // Insert 3 new unread notifications for User 1
    await createNotification(user1Id, 'post_liked', { post_id: 'post-1' });
    await createNotification(user1Id, 'tier_promotion', { new_tier: 'silver' });
    await createNotification(user1Id, 'followed_user_pr', { pr_id: 'pr-123' });

    // Verify User 1 now has 3 unread
    const preCheck = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${user1Token}`);
    expect(preCheck.body.data.unread_count).toBe(3);

    // Call mark all read
    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.marked_count).toBe(3);

    // Verify unread count is now 0
    const postCheck = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${user1Token}`);
    expect(postCheck.body.data.unread_count).toBe(0);
  });
});
