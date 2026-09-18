// Ranking model: database queries for global and friends-scoped leaderboards
const db = require('../../config/db');

/**
 * Fetch the user's tier
 * @param {string} userId 
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<string>}
 */
const getUserTier = async (userId, client = null) => {
  const executor = client || db;
  const result = await executor.query(`SELECT tier FROM users WHERE id = $1`, [userId]);
  return result.rows[0] ? result.rows[0].tier : null;
};

/**
 * Gets a dynamically ranked leaderboard consisting of the user and their friends (following)
 * @param {string} userId 
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getFriendsRanking = async (userId, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT 
      u.id as user_id, 
      u.name, 
      u.photo_url, 
      u.tier, 
      u.rp_total,
      RANK() OVER (ORDER BY u.rp_total DESC) as rank
    FROM users u
    WHERE u.id = $1 OR u.id IN (SELECT following_id FROM follows WHERE follower_id = $1)
    ORDER BY u.rp_total DESC;
  `;
  const result = await executor.query(queryText, [userId]);
  return result.rows;
};

/**
 * Gets the tier-scoped leaderboard from the materialized view
 * @param {string} tier 
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getTierRanking = async (tier, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT 
      user_id, 
      name, 
      tier, 
      rp_total, 
      tier_rank as rank, 
      global_rank
    FROM leaderboard_snapshot
    WHERE tier = $1
    ORDER BY tier_rank ASC
    LIMIT 100;
  `;
  const result = await executor.query(queryText, [tier]);
  return result.rows;
};

/**
 * Refresh the materialized view for the leaderboard
 * @param {import('pg').PoolClient} [client]
 */
const refreshLeaderboard = async (client = null) => {
  const executor = client || db;
  await executor.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_snapshot;`);
};

module.exports = {
  getUserTier,
  getFriendsRanking,
  getTierRanking,
  refreshLeaderboard,
};
