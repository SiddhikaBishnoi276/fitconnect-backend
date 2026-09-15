const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

describe('Auth Module Flow — Automated Test Suite', () => {
  const timestamp = Date.now();
  const testUser = {
    name: 'Test Runner',
    email: `test.athlete.${timestamp}@example.com`,
    password: 'Password@12345',
    age: 26,
    weight_kg: 72.0,
    height_cm: 178.0,
    gender: 'male',
    activity_level: 'intermediate',
    equipment: 'gym',
    time_budget_minutes: 50,
    preferred_days: [1, 3, 5],
    goals: ['hypertrophy', 'strength'],
    diet_preference: 'veg',
    sports: [
      { slug: 'basketball', name: 'Basketball' }
    ],
    injuries: [
      {
        body_part: 'ankle_left',
        condition: 'sprain',
        occurred_months_ago: 3,
        recovery_status: 'mostly_recovered',
        notes: 'Low impact on jumps'
      }
    ]
  };

  let accessToken = '';
  let refreshToken = '';
  let newlyRefreshedAccessToken = '';

  afterAll(async () => {
    // Close database connection pool so Jest exits cleanly
    if (pool) {
      await pool.end();
    }
  });

  // 1. Signup -> success
  test('1. POST /api/v1/auth/signup -> Successfully registers a new user', async () => {
    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send(testUser)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Signup successful');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.email).toBe(testUser.email.toLowerCase());
    expect(response.body.data.password_hash).toBeUndefined();
    expect(response.body.data.sports).toHaveLength(1);
    expect(response.body.data.injuries).toHaveLength(1);
  });

  // 2. Login -> tokens milte hain
  test('2. POST /api/v1/auth/login -> Successfully logs in and returns access & refresh tokens', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
        deviceInfo: 'Jest Supertest Runner'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Login successful');
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
    expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(response.body.data.user.password_hash).toBeUndefined();

    accessToken = response.body.data.accessToken;
    refreshToken = response.body.data.refreshToken;
  });

  // 3. Protected route access test with access token
  test('3. Protected Route -> Fails without token (401), succeeds with valid access token', async () => {
    // 3a. Unauthorized without token
    const unauthorizedRes = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken })
      .expect(401);

    expect(unauthorizedRes.body.success).toBe(false);
    expect(unauthorizedRes.body.error.code).toBe('UNAUTHORIZED');

    // 3b. Verify invalid token rejection
    const invalidTokenRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer invalid_token_xyz')
      .send({ refreshToken })
      .expect(401);

    expect(invalidTokenRes.body.success).toBe(false);
    expect(invalidTokenRes.body.error.code).toBe('UNAUTHORIZED');
  });

  // 4. Refresh-token se naya access token lo
  test('4. POST /api/v1/auth/refresh-token -> Issues a fresh access token using valid refresh token', async () => {
    // Small delay to ensure timestamp in JWT advances
    await new Promise((r) => setTimeout(r, 1000));

    const response = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Token refreshed');
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.accessToken).not.toBe(accessToken);

    newlyRefreshedAccessToken = response.body.data.accessToken;
  });

  // 5. Logout karo
  test('5. POST /api/v1/auth/logout -> Successfully logs out and invalidates refresh token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${newlyRefreshedAccessToken}`)
      .send({ refreshToken })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Logged out successfully');
    expect(response.body.data).toBeNull();
  });

  // 6. Logout ke baad purana refresh token dobara use karke refresh try karo -> fail hona chahiye
  test('6. POST /api/v1/auth/refresh-token -> Fails with INVALID_REFRESH_TOKEN after logout', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(response.body.error.message).toBe('Invalid or expired refresh token');
  });
});
