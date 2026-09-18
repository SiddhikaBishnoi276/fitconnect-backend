// Auth model: database queries for user credentials and auth tokens
const db = require('../../config/db');

/**
 * Finds a user by email address (case-insensitive)
 * @param {string} email
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const findUserByEmail = async (email, client = null) => {
  const executor = client || db;
  const result = await executor.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1);',
    [email.trim()]
  );
  return result.rows[0] || null;
};

/**
 * Finds a user by ID without password_hash and includes sports & injuries
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const findUserById = async (userId, client = null) => {
  const executor = client || db;
  const userResult = await executor.query(
    `SELECT 
       id, name, email, phone, auth_provider, photo_url,
       age, weight_kg, height_cm, gender, activity_level,
       equipment, time_budget_minutes, preferred_days, goals,
       diet_preference, regional_cuisine, rp_total, tier,
       current_streak, longest_streak, privacy, created_at, updated_at
     FROM users
     WHERE id = $1;`,
    [userId]
  );

  const user = userResult.rows[0];
  if (!user) return null;

  const sportsResult = await executor.query(
    `SELECT us.sport_id, s.slug, s.name
     FROM user_sports us
     JOIN sports s ON us.sport_id = s.id
     WHERE us.user_id = $1;`,
    [userId]
  );

  const injuriesResult = await executor.query(
    `SELECT id, body_part, condition, occurred_months_ago, recovery_status, notes, created_at
     FROM user_injuries
     WHERE user_id = $1
     ORDER BY created_at DESC;`,
    [userId]
  );

  return {
    ...user,
    sports: sportsResult.rows,
    injuries: injuriesResult.rows,
  };
};

/**
 * Creates a new user record in the database
 * @param {object} userData
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
const createUser = async (userData, client = null) => {
  const executor = client || db;
  const {
    name,
    username,
    email,
    password_hash,
    phone = null,
    auth_provider = 'email',
    photo_url = null,
    age = 25,
    weight_kg = 70.0,
    height_cm = 175.0,
    gender = 'other',
    activity_level = 'beginner',
    equipment = 'gym',
    time_budget_minutes = 45,
    preferred_days = [1, 2, 3, 4, 5],
    goals = ['general_fitness'],
    diet_preference = 'veg',
    regional_cuisine = null,
    privacy = 'public',
  } = userData;

  const queryText = `
    INSERT INTO users (
      name, username, email, password_hash, phone, auth_provider, photo_url,
      age, weight_kg, height_cm, gender, activity_level,
      equipment, time_budget_minutes, preferred_days, goals,
      diet_preference, regional_cuisine, privacy
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18, $19
    ) RETURNING *;
  `;

  const values = [
    name.trim(),
    username.toLowerCase().trim(),
    email.toLowerCase().trim(),
    password_hash,
    phone,
    auth_provider,
    photo_url,
    age,
    weight_kg,
    height_cm,
    gender,
    activity_level,
    equipment,
    time_budget_minutes,
    preferred_days,
    goals,
    diet_preference,
    regional_cuisine,
    privacy,
  ];

  const result = await executor.query(queryText, values);
  return result.rows[0];
};

/**
 * Bulk associates sports with a user
 * @param {string} userId
 * @param {Array<number|string|object>} sportsArray
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const addUserSports = async (userId, sportsArray = [], client = null) => {
  if (!sportsArray || sportsArray.length === 0) return [];
  const executor = client || db;
  const insertedSports = [];

  for (const item of sportsArray) {
    let sportId = null;
    if (typeof item === 'number') {
      sportId = item;
    } else if (typeof item === 'object' && item.id) {
      sportId = item.id;
    } else if (typeof item === 'string' || (typeof item === 'object' && (item.slug || item.name))) {
      const slug = (typeof item === 'string' ? item : (item.slug || item.name)).toLowerCase().trim().replace(/\s+/g, '_');
      const name = (typeof item === 'object' && item.name) ? item.name : slug.charAt(0).toUpperCase() + slug.slice(1);

      const sportRes = await executor.query(
        `INSERT INTO sports (slug, name)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, slug, name;`,
        [slug, name]
      );
      sportId = sportRes.rows[0].id;
    }

    if (sportId) {
      await executor.query(
        `INSERT INTO user_sports (user_id, sport_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, sport_id) DO NOTHING;`,
        [userId, sportId]
      );
      insertedSports.push({ user_id: userId, sport_id: sportId });
    }
  }

  return insertedSports;
};

/**
 * Bulk associates injuries with a user
 * @param {string} userId
 * @param {Array<object>} injuriesArray
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const addUserInjuries = async (userId, injuriesArray = [], client = null) => {
  if (!injuriesArray || injuriesArray.length === 0) return [];
  const executor = client || db;
  const insertedInjuries = [];

  for (const item of injuriesArray) {
    const bodyPart = item.body_part || item.bodyPart || 'general';
    const condition = item.condition || item.injury_type || item.injuryType || 'general_discomfort';
    const occurredMonthsAgo = item.occurred_months_ago || item.occurredMonthsAgo || null;
    const recoveryStatus = item.recovery_status || item.recoveryStatus || 'ongoing';
    const notes = item.notes || item.description || null;

    const res = await executor.query(
      `INSERT INTO user_injuries (user_id, body_part, condition, occurred_months_ago, recovery_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [userId, bodyPart, condition, occurredMonthsAgo, recoveryStatus, notes]
    );
    insertedInjuries.push(res.rows[0]);
  }

  return insertedInjuries;
};

/**
 * Inserts or stores a device / refresh token for a user
 * @param {string} userId
 * @param {string} refreshToken
 * @param {string} [deviceInfo]
 * @param {Date|string} [expiresAt]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
const createDeviceToken = async (userId, refreshToken, deviceInfo = null, expiresAt = null, client = null) => {
  const executor = client || db;
  const queryText = `
    INSERT INTO device_tokens (user_id, refresh_token, device_info, expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const result = await executor.query(queryText, [userId, refreshToken, deviceInfo, expiresAt]);
  return result.rows[0];
};

/**
 * Finds a valid (not expired) device token record by refresh token
 * @param {string} refreshToken
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const findDeviceTokenByRefreshToken = async (refreshToken, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT * FROM device_tokens
    WHERE refresh_token = $1
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  const result = await executor.query(queryText, [refreshToken]);
  return result.rows[0] || null;
};

/**
 * Deletes / invalidates a device / refresh token
 * @param {string} refreshToken
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<number>} Number of rows deleted
 */
const deleteDeviceToken = async (refreshToken, client = null) => {
  const executor = client || db;
  const queryText = `
    DELETE FROM device_tokens
    WHERE refresh_token = $1;
  `;
  const result = await executor.query(queryText, [refreshToken]);
  return result.rowCount;
};

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  addUserSports,
  addUserInjuries,
  createDeviceToken,
  findDeviceTokenByRefreshToken,
  deleteDeviceToken,
};
