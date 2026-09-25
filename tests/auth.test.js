const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

jest.setTimeout(20000);

describe('Auth Module Flow — Automated Test Suite', () => {
  const ts = Date.now().toString().slice(-8);
  const testUser = {
    name: 'Test Runner',
    username: `runner_${ts}`,
    email: `athlete.${ts}@example.com`,
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
    expect(response.body.data.user.id).toBeDefined();
    expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(response.body.data.user.password_hash).toBeUndefined();
    expect(response.body.data.user.sports).toHaveLength(1);
    expect(response.body.data.user.injuries).toHaveLength(1);
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

  // 3. Protected route access test with access token (GET /me)
  test('3. GET /api/v1/auth/me -> Fails without token (401), succeeds with valid access token (200)', async () => {
    // 3a. Case 1: Unauthorized without Authorization header
    const unauthorizedRes = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    expect(unauthorizedRes.body.success).toBe(false);
    expect(unauthorizedRes.body.error.code).toBe('UNAUTHORIZED');

    // 3b. Case 2: Valid access token -> 200 + user data without password_hash
    const authorizedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(authorizedRes.body.success).toBe(true);
    expect(authorizedRes.body.message).toBe('User fetched successfully');
    expect(authorizedRes.body.data).toBeDefined();
    expect(authorizedRes.body.data.email).toBe(testUser.email.toLowerCase());
    expect(authorizedRes.body.data.password_hash).toBeUndefined();
    expect(authorizedRes.body.data.sports).toBeDefined();
    expect(authorizedRes.body.data.injuries).toBeDefined();
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

  // 7. Forgot Password -> sends OTP
  test('7. POST /api/v1/auth/forgot-password -> Sends OTP to registered email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: testUser.email })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Password reset OTP has been sent to your email');
    expect(response.body.data.email).toBe(testUser.email.toLowerCase());
    expect(response.body.data.expiresInMinutes).toBe(10);
  });

  // 8. Verify OTP -> Fails with invalid OTP
  test('8. POST /api/v1/auth/verify-otp -> Fails with INVALID_OTP when code is wrong', async () => {
    const response = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: testUser.email, otp: '000000' })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_OTP');
  });

  // 9. Reset Password -> Fails with invalid OTP, succeeds when valid
  test('9. POST /api/v1/auth/reset-password -> Resets password and allows login with new password', async () => {
    const otpManager = require('../src/utils/otpManager');
    // Set a known OTP for test
    const { otp } = otpManager.createOtp(testUser.email);
    const newPassword = 'NewSecretPassword@2026';

    // 9a. Verify OTP
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: testUser.email, otp })
      .expect(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.valid).toBe(true);

    // 9b. Reset password with OTP
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        email: testUser.email,
        otp,
        newPassword
      })
      .expect(200);

    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.message).toBe('Password has been reset successfully');

    // 9c. Login with old password -> should fail
    const oldLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(401);
    expect(oldLoginRes.body.success).toBe(false);

    // 9d. Login with new password -> should succeed
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: newPassword
      })
      .expect(200);
    expect(newLoginRes.body.success).toBe(true);
    expect(newLoginRes.body.data.accessToken).toBeDefined();
  });
});

