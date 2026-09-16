const request = require('supertest');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');

describe('Sports & Exercise Module Flow — Automated Test Suite', () => {
  let accessToken = '';
  let validSportId = 1;
  let validExerciseId = '';

  beforeAll(async () => {
    // 1. Create and authenticate test user to obtain valid access token
    const timestamp = Date.now();
    const testEmail = `sports.exercise.runner.${timestamp}@example.com`;

    await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Sports & Exercise Tester',
        email: testEmail,
        password: 'Password@12345',
        age: 26,
        weight_kg: 72.0,
        height_cm: 178.0,
        gender: 'male',
        activity_level: 'intermediate',
        equipment: 'gym',
        time_budget_minutes: 50,
        goals: ['hypertrophy', 'strength'],
        diet_preference: 'veg'
      });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'Password@12345'
      });

    accessToken = loginRes.body.data.accessToken;

    // 2. Fetch a valid sport and exercise from database for dynamic testing
    const sportResult = await query('SELECT id FROM sports LIMIT 1;');
    if (sportResult.rows.length > 0) {
      validSportId = sportResult.rows[0].id;
    }

    const exerciseResult = await query('SELECT id FROM exercises LIMIT 1;');
    if (exerciseResult.rows.length > 0) {
      validExerciseId = exerciseResult.rows[0].id;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  // 1. GET /sports -> 200, array return hona chahiye (public, no token needed)
  test('1. GET /api/v1/sports -> Successfully returns sports list with 200 without auth', async () => {
    const res = await request(app)
      .get('/api/v1/sports')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Sports fetched successfully');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstSport = res.body.data[0];
    expect(firstSport).toHaveProperty('id');
    expect(firstSport).toHaveProperty('slug');
    expect(firstSport).toHaveProperty('name');
  });

  // 2. GET /exercises bina token -> 401
  test('2. GET /api/v1/exercises -> Fails without auth token (401)', async () => {
    const res = await request(app)
      .get('/api/v1/exercises')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 3. GET /exercises with token -> 200, array
  test('3. GET /api/v1/exercises -> Returns all exercises with valid token (200)', async () => {
    const res = await request(app)
      .get('/api/v1/exercises')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Exercises fetched successfully');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstExercise = res.body.data[0];
    expect(firstExercise).toHaveProperty('id');
    expect(firstExercise).toHaveProperty('name');
    expect(firstExercise).toHaveProperty('load_tags');
  });

  // 4. GET /exercises?sport_id=<validId> with token -> filtered array
  test('4. GET /api/v1/exercises?sport_id=<validId> -> Returns filtered exercises for sport (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/exercises?sport_id=${validSportId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Exercises fetched successfully');
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((exercise) => {
      expect(exercise.sport_id).toBe(validSportId);
    });
  });

  // 5. GET /exercises/:id with valid id -> 200, substitutes array included
  test('5. GET /api/v1/exercises/:id -> Returns exercise detail with substitutes (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/exercises/${validExerciseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Exercise detail fetched successfully');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(validExerciseId);
    expect(Array.isArray(res.body.data.substitutes)).toBe(true);
  });

  // 6. GET /exercises/:id with invalid id -> 404 + EXERCISE_NOT_FOUND
  test('6. GET /api/v1/exercises/:id -> Fails with EXERCISE_NOT_FOUND for non-existent id (404)', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/v1/exercises/${nonExistentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EXERCISE_NOT_FOUND');
    expect(res.body.error.message).toBe('Exercise not found');
  });
});
