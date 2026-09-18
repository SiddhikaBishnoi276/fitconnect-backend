// Verification model: database queries for verification logs, trust scores, and flagged activities
const db = require('../../config/db');

/**
 * Cast a vote on a PR. Uses UPSERT to ensure one vote per user per PR.
 * @param {string} prId 
 * @param {string} voterId 
 * @param {string} vote 
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
const castVote = async (prId, voterId, vote, client = null) => {
  const executor = client || db;
  const queryText = `
    INSERT INTO pr_votes (pr_id, voter_id, vote)
    VALUES ($1, $2, $3)
    ON CONFLICT (pr_id, voter_id) 
    DO UPDATE SET 
      vote = EXCLUDED.vote,
      created_at = now()
    RETURNING pr_id, voter_id, vote, created_at;
  `;
  const result = await executor.query(queryText, [prId, voterId, vote]);
  return result.rows[0];
};

module.exports = {
  castVote,
};
