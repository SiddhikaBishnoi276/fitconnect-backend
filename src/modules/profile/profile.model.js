// Profile model: database queries for athlete profile, personal records (PRs), and display badges
const db = require('../../config/db');

/**
 * Fetches lightweight user profile summary for profile header
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const getUserProfileSummary = async (userId, client = null) => {
  const executor = client || db;
  const result = await executor.query(
    `SELECT id, name, photo_url, tier, rp_total, current_streak, privacy
     FROM users
     WHERE id = $1;`,
    [userId]
  );
  return result.rows[0] || null;
};

/**
 * Fetches sports associated with a user
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getUserSports = async (userId, client = null) => {
  const executor = client || db;
  const result = await executor.query(
    `SELECT us.sport_id, s.slug, s.name
     FROM user_sports us
     JOIN sports s ON us.sport_id = s.id
     WHERE us.user_id = $1;`,
    [userId]
  );
  return result.rows;
};

/**
 * Fetches editable profile fields of a user
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const getUserEditableProfile = async (userId, client = null) => {
  const executor = client || db;
  const result = await executor.query(
    `SELECT name, photo_url, age, weight_kg, height_cm
     FROM users
     WHERE id = $1;`,
    [userId]
  );
  return result.rows[0] || null;
};

/**
 * Dynamically updates editable profile fields for a user
 * @param {string} userId
 * @param {object} updates - subset of { name, photo_url, age, weight_kg, height_cm }
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const updateUserProfile = async (userId, updates = {}, client = null) => {
  const executor = client || db;
  const allowedFields = ['name', 'photo_url', 'age', 'weight_kg', 'height_cm'];
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field) && updates[field] !== undefined) {
      setClauses.push(`${field} = $${paramIndex}`);
      values.push(updates[field]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getUserEditableProfile(userId, client);
  }

  setClauses.push(`updated_at = now()`);
  values.push(userId);

  const queryText = `
    UPDATE users
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, photo_url, age, weight_kg, height_cm;
  `;

  const result = await executor.query(queryText, values);
  return result.rows[0] || null;
};

/**
 * Fetches injuries recorded for a user
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getUserInjuries = async (userId, client = null) => {
  const executor = client || db;
  const result = await executor.query(
    `SELECT id, body_part, condition, occurred_months_ago, recovery_status, notes
     FROM user_injuries
     WHERE user_id = $1
     ORDER BY created_at DESC;`,
    [userId]
  );
  return result.rows;
};

/**
 * Replaces all injuries for a user in a single transaction
 * @param {string} userId
 * @param {Array<object>} injuriesArray
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const replaceUserInjuries = async (userId, injuriesArray = [], client = null) => {
  const isExternalClient = !!client;
  const activeClient = isExternalClient ? client : await db.getClient();

  try {
    if (!isExternalClient) {
      await activeClient.query('BEGIN');
    }

    await activeClient.query(
      `DELETE FROM user_injuries WHERE user_id = $1;`,
      [userId]
    );

    const insertedInjuries = [];
    if (Array.isArray(injuriesArray) && injuriesArray.length > 0) {
      for (const item of injuriesArray) {
        const bodyPart = item.body_part || item.bodyPart || 'general';
        const condition = item.condition || item.injury_type || item.injuryType || 'general_discomfort';
        const occurredMonthsAgo = item.occurred_months_ago !== undefined ? item.occurred_months_ago : (item.occurredMonthsAgo !== undefined ? item.occurredMonthsAgo : null);
        const recoveryStatus = item.recovery_status || item.recoveryStatus || 'ongoing';
        const notes = item.notes || item.description || null;

        const res = await activeClient.query(
          `INSERT INTO user_injuries (user_id, body_part, condition, occurred_months_ago, recovery_status, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, body_part, condition, occurred_months_ago, recovery_status, notes, created_at;`,
          [userId, bodyPart, condition, occurredMonthsAgo, recoveryStatus, notes]
        );
        insertedInjuries.push(res.rows[0]);
      }
    }

    if (!isExternalClient) {
      await activeClient.query('COMMIT');
    }

    return insertedInjuries;
  } catch (error) {
    if (!isExternalClient) {
      await activeClient.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (!isExternalClient) {
      activeClient.release();
    }
  }
};

/**
 * Fetches diet preference, regional cuisine, and privacy settings
 * @param {string} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const getUserPreferences = async (userId, client = null) => {
  const executor = client || db;
  const result = await executor.query(
    `SELECT diet_preference, regional_cuisine, privacy
     FROM users
     WHERE id = $1;`,
    [userId]
  );
  return result.rows[0] || null;
};

/**
 * Dynamically updates preferences (diet_preference, regional_cuisine, privacy)
 * @param {string} userId
 * @param {object} updates - subset of { diet_preference, regional_cuisine, privacy }
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const updateUserPreferences = async (userId, updates = {}, client = null) => {
  const executor = client || db;
  const allowedFields = ['diet_preference', 'regional_cuisine', 'privacy'];
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field) && updates[field] !== undefined) {
      setClauses.push(`${field} = $${paramIndex}`);
      values.push(updates[field]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getUserPreferences(userId, client);
  }

  setClauses.push(`updated_at = now()`);
  values.push(userId);

  const queryText = `
    UPDATE users
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING diet_preference, regional_cuisine, privacy;
  `;

  const result = await executor.query(queryText, values);
  return result.rows[0] || null;
};

/**
 * Fetches personal records (PRs) — best PR per exercise
 * Uses DISTINCT ON (p.exercise_id) to return the single best (highest value) PR per exercise.
 * @param {string} userId
 * @param {number|null} [sportId=null]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getUserPersonalRecords = async (userId, sportId = null, client = null) => {
  const executor = client || db;
  const params = [userId];
  let sportFilter = '';

  if (sportId !== null && sportId !== undefined) {
    params.push(sportId);
    sportFilter = `AND e.sport_id = $2`;
  }

  const queryText = `
    SELECT DISTINCT ON (p.exercise_id)
      p.id,
      p.exercise_id,
      p.metric,
      p.value,
      p.previous_best,
      p.created_at,
      p.genuine_votes,
      p.flag_votes,
      p.verification_status AS original_verification_status,
      e.name AS exercise_name,
      e.sport_id
    FROM prs p
    JOIN exercises e ON p.exercise_id = e.id
    WHERE p.user_id = $1 ${sportFilter}
    ORDER BY p.exercise_id, p.value DESC, p.created_at DESC;
  `;

  const result = await executor.query(queryText, params);
  
  // Override verification status dynamically at the application layer
  return result.rows.map(row => {
    let customStatus = 'unverified';
    if (row.genuine_votes > row.flag_votes) {
      customStatus = 'genuine';
    } else if (row.flag_votes > row.genuine_votes) {
      customStatus = 'disputed';
    }
    
    return {
      ...row,
      verification_status: customStatus
    };
  });
};

/**
 * Creates a new personal record for the user. Optionally creates a post.
 * @param {string} userId 
 * @param {string} exerciseId 
 * @param {string} metric 
 * @param {number} value 
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
const createPersonalRecord = async (userId, exerciseId, metric, value, client = null) => {
  const isExternalClient = !!client;
  const activeClient = isExternalClient ? client : await db.getClient();
  try {
    if (!isExternalClient) await activeClient.query('BEGIN');

    // Find previous best to populate previous_best
    const prevBestRes = await activeClient.query(
      `SELECT value FROM prs WHERE user_id = $1 AND exercise_id = $2 AND metric = $3 ORDER BY value DESC LIMIT 1;`,
      [userId, exerciseId, metric]
    );
    const previousBest = prevBestRes.rows.length > 0 ? prevBestRes.rows[0].value : null;

    const prRes = await activeClient.query(
      `INSERT INTO prs (user_id, exercise_id, metric, value, previous_best)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [userId, exerciseId, metric, value, previousBest]
    );
    const pr = prRes.rows[0];

    // Create a post of type 'pr'
    await activeClient.query(
      `INSERT INTO posts (user_id, type, caption, pr_id)
       VALUES ($1, 'pr', 'New Personal Record!', $2);`,
      [userId, pr.id]
    );

    if (!isExternalClient) await activeClient.query('COMMIT');

    pr.verification_status = 'unverified';
    return pr;
  } catch (error) {
    if (!isExternalClient) await activeClient.query('ROLLBACK');
    throw error;
  } finally {
    if (!isExternalClient) activeClient.release();
  }
};

module.exports = {
  getUserProfileSummary,
  getUserSports,
  getUserEditableProfile,
  updateUserProfile,
  getUserInjuries,
  replaceUserInjuries,
  getUserPreferences,
  updateUserPreferences,
  getUserPersonalRecords,
  createPersonalRecord,
};
