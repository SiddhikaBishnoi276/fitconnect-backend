// Progress model: database queries for user gamification stats, RP ledger, and PRs
const db = require('../../config/db');

/**
 * Fetches user stats (rp_total, tier, current_streak, longest_streak) by user ID
 * @param {string|number} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>} Single row or null if not found
 */
const getUserStats = async (userId, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT rp_total, tier, current_streak, longest_streak
    FROM users
    WHERE id = $1;
  `;
  const result = await executor.query(queryText, [userId]);
  return result.rows[0] || null;
};

/**
 * Fetches total RP grouped by type for a user
 * @param {string|number} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<{type: string, total: string|number}>>}
 */
const getRPBreakdown = async (userId, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT type, SUM(points) AS total
    FROM rp_ledger
    WHERE user_id = $1
    GROUP BY type;
  `;
  const result = await executor.query(queryText, [userId]);
  return result.rows || [];
};

/**
 * Fetches all personal records (PRs) for a user joined with exercise details
 * @param {string|number} userId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getUserPRs = async (userId, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT 
      prs.id, 
      prs.exercise_id, 
      prs.metric, 
      prs.value, 
      prs.previous_best, 
      prs.verification_status, 
      prs.created_at,
      exercises.name AS exercise_name, 
      exercises.sport_id
    FROM prs
    JOIN exercises ON prs.exercise_id = exercises.id
    WHERE prs.user_id = $1
    ORDER BY exercises.sport_id ASC, prs.created_at DESC;
  `;
  const result = await executor.query(queryText, [userId]);
  return result.rows || [];
};

module.exports = {
  getUserStats,
  getRPBreakdown,
  getUserPRs,
};
