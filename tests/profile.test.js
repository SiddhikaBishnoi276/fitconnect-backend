const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

// Set adequate timeout for remote Neon DB SSL operations
jest.setTimeout(30000);

describe('Profile & Settings Module — Comprehensive Test Suite', () => {
  const timestamp = Date.now();
  let testUserId = null;
  let accessToken = null;
  let testSportId = null;
  let otherSportId = null;
  let exercise1Id = null;
  let exercise2Id = null;

  const testUser = {
    name: 'Profile Athlete Tester',
    email: `athlete.profile.${timestamp}@fitconnect.test`,
    password: 'Password@12345',
    age: 26,
    weight_kg: 72.0,
    height_cm: 178.0,
    gender: 'male',
    activity_level: 'intermediate',
    equipment: 'gym',
    time_budget_minutes: 45,
    preferred_days: [1, 3, 5],
    goals: ['hypertrophy', 'strength'],
    diet_preference: 'veg',
    regional_cuisine: 'North Indian',
    privacy: 'public',
    sports: [
      { slug: `football_${timestamp}`, name: 'Football' },
    ],
    injuries: [
      {
        body_part: 'ankle_left',
        condition: 'sprain',
        occurred_months_ago: 3,
        recovery_status: 'mostly_recovered',
        notes: 'Low impact on jumps',
      },
    ],
  };

  beforeAll(async () => {
    // 1. Signup to create user
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send(testUser)
      .expect(201);

    expect(signupRes.body.success).toBe(true);
    testUserId = signupRes.body.data.id;

    // 2. Login to get accessToken
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(loginRes.body.success).toBe(true);
    accessToken = loginRes.body.data.accessToken;

    // 3. Setup test sports, exercises & PRs directly in DB for records testing
    const sportRes1 = await pool.query(
      `INSERT INTO sports (slug, name) VALUES ('swimming_${timestamp}', 'Swimming') RETURNING id;`
    );
    const sportRes2 = await pool.query(
      `INSERT INTO sports (slug, name) VALUES ('weightlifting_${timestamp}', 'Weightlifting') RETURNING id;`
    );
    testSportId = sportRes1.rows[0].id;
    otherSportId = sportRes2.rows[0].id;

    const ex1 = await pool.query(
      `INSERT INTO exercises (name, sport_id) VALUES ('Freestyle 100m', $1) RETURNING id;`,
      [testSportId]
    );
    const ex2 = await pool.query(
      `INSERT INTO exercises (name, sport_id) VALUES ('Deadlift', $1) RETURNING id;`,
      [otherSportId]
    );
    exercise1Id = ex1.rows[0].id;
    exercise2Id = ex2.rows[0].id;

    // Insert multiple PRs for Freestyle 100m (same exercise, different values and dates)
    await pool.query(`
      INSERT INTO prs (user_id, exercise_id, metric, value, previous_best, created_at)
      VALUES 
        ($1, $2, 'time_sec', 65.0, NULL, NOW() - INTERVAL '10 days'),
        ($1, $2, 'time_sec', 58.5, 65.0, NOW() - INTERVAL '2 days'),
        ($1, $2, 'time_sec', 60.0, 58.5, NOW() - INTERVAL '1 day');
    `, [testUserId, exercise1Id]);

    // Insert 1 PR for Deadlift (different sport)
    await pool.query(`
      INSERT INTO prs (user_id, exercise_id, metric, value, previous_best, created_at)
      VALUES ($1, $2, '1rm_kg', 180.0, NULL, NOW());
    `, [testUserId, exercise2Id]);
  }, 30000);

  afterAll(async () => {
    // Cleanup test data
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1;', [testUserId]);
    }
    if (testSportId) {
      await pool.query('DELETE FROM exercises WHERE sport_id IN ($1, $2);', [testSportId, otherSportId]);
      await pool.query('DELETE FROM sports WHERE id IN ($1, $2);', [testSportId, otherSportId]);
    }
    if (pool) {
      await pool.end();
    }
  }, 30000);

  // 1. GET /profile/me bina token -> 401
  test('1. GET /api/v1/profile/me -> 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await request(app)
      .get('/api/v1/profile/me')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 2. GET /profile/me valid token -> 200, response me name/photo_url/tier/rp_total/current_streak/sports array ho
  test('2. GET /api/v1/profile/me -> 200 with valid token, returns name, photo_url, tier, rp_total, current_streak, sports', async () => {
    const res = await request(app)
      .get('/api/v1/profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(testUserId);
    expect(res.body.data.name).toBe(testUser.name);
    expect(res.body.data).toHaveProperty('photo_url');
    expect(res.body.data).toHaveProperty('tier');
    expect(res.body.data).toHaveProperty('rp_total');
    expect(res.body.data).toHaveProperty('current_streak');
    expect(res.body.data).toHaveProperty('privacy');
    expect(Array.isArray(res.body.data.sports)).toBe(true);
    expect(res.body.data.sports.length).toBeGreaterThanOrEqual(1);
  });

  // 3. PATCH /profile/me valid data (age: 25, weight_kg: 70) -> 200, updated values confirm karo
  test('3. PATCH /api/v1/profile/me -> 200 with valid data, updates age and weight_kg', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        age: 25,
        weight_kg: 70.0,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.age).toBe(25);
    expect(Number(res.body.data.weight_kg)).toBe(70.0);
  });

  // 4. PATCH /profile/me invalid age (jaise 150) -> 400, VALIDATION_ERROR
  test('4. PATCH /api/v1/profile/me -> 400 VALIDATION_ERROR when age is invalid (150)', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        age: 150,
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/Age must be an integer between 1 and 99/i);
  });

  // 5. PUT /profile/injuries valid array -> 200, injuries replace ho gaye confirm karo
  test('5. PUT /api/v1/profile/injuries -> 200 with valid array, replaces all user injuries', async () => {
    const newInjuries = [
      {
        body_part: 'shoulder_right',
        condition: 'rotator_cuff_impingement',
        occurred_months_ago: 1,
        recovery_status: 'partially_recovered',
        notes: 'Limit overhead pressing',
      },
      {
        body_part: 'wrist_left',
        condition: 'strain',
        occurred_months_ago: 2,
        recovery_status: 'fully_healed',
        notes: 'Healed completely',
      },
    ];

    const res = await request(app)
      .put('/api/v1/profile/injuries')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ injuries: newInjuries })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].body_part).toBe('shoulder_right');
    expect(res.body.data[1].body_part).toBe('wrist_left');
  });

  // 6. PUT /profile/injuries invalid recovery_status -> 400, VALIDATION_ERROR
  test('6. PUT /api/v1/profile/injuries -> 400 VALIDATION_ERROR when recovery_status is invalid', async () => {
    const invalidInjuries = [
      {
        body_part: 'knee_right',
        condition: 'meniscus_tear',
        recovery_status: 'magic_healing_super_fast',
      },
    ];

    const res = await request(app)
      .put('/api/v1/profile/injuries')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ injuries: invalidInjuries })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/invalid recovery_status/i);
  });

  // 7. PATCH /profile/preferences valid diet_preference -> 200
  test('7. PATCH /api/v1/profile/preferences -> 200 with valid diet_preference and privacy', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        diet_preference: 'vegan',
        regional_cuisine: 'South Indian',
        privacy: 'private',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.diet_preference).toBe('vegan');
    expect(res.body.data.regional_cuisine).toBe('South Indian');
    expect(res.body.data.privacy).toBe('private');
  });

  // 8. PATCH /profile/preferences invalid diet_preference (jaise 'keto') -> 400, VALIDATION_ERROR
  test('8. PATCH /api/v1/profile/preferences -> 400 VALIDATION_ERROR with invalid diet_preference ("keto")', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        diet_preference: 'keto',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/Invalid diet_preference/i);
  });

  // 8a. PATCH /profile/preferences with notifications_enabled: false -> 200, returns notifications_enabled: false
  test('8a. PATCH /api/v1/profile/preferences -> 200 with notifications_enabled: false', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        notifications_enabled: false,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications_enabled).toBe(false);
  });

  // 8b. PATCH /profile/preferences { diet_preference: "veg" } -> returns notifications_enabled field present
  test('8b. PATCH /api/v1/profile/preferences -> 200 with other field, returns notifications_enabled field present', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        diet_preference: 'veg',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.diet_preference).toBe('veg');
    expect(res.body.data).toHaveProperty('notifications_enabled');
  });

  // 8c. PATCH /profile/preferences invalid notifications_enabled ("yes") -> 400 VALIDATION_ERROR
  test('8c. PATCH /api/v1/profile/preferences -> 400 VALIDATION_ERROR when notifications_enabled is non-boolean ("yes")', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        notifications_enabled: 'yes',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/notifications_enabled must be a boolean/i);
  });

  // 9. GET /profile/records bina sport_id -> 200, array (empty bhi valid)
  test('9. GET /api/v1/profile/records -> 200 without sport_id returns all personal records (distinct per exercise)', async () => {
    const res = await request(app)
      .get('/api/v1/profile/records')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2); // 1 for Freestyle 100m, 1 for Deadlift
  });

  // 10. GET /profile/records?sport_id=<invalid> (jaise 'abc') -> 400, INVALID_SPORT_ID
  test('10. GET /api/v1/profile/records?sport_id=abc -> 400 INVALID_SPORT_ID when sport_id is non-numeric', async () => {
    const res = await request(app)
      .get('/api/v1/profile/records?sport_id=abc')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_SPORT_ID');
    expect(res.body.error.message).toMatch(/must be a positive integer/i);
  });

  // 11. GET /profile/records?sport_id=<validId> -> 200, filtered array, per-exercise sirf ek best record aana chahiye
  test('11. GET /api/v1/profile/records?sport_id=<validId> -> 200 filtered by sport_id, returns exact 1 best PR per exercise with no duplicates', async () => {
    const res = await request(app)
      .get(`/api/v1/profile/records?sport_id=${testSportId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1); // Only Freestyle 100m for Swimming

    const record = res.body.data[0];
    expect(record.exercise_name).toBe('Freestyle 100m');
    expect(record.sport_id).toBe(testSportId);
    expect(Number(record.value)).toBe(65.0); // max value among (65.0, 58.5, 60.0)
  });
});
