// Progress service: shapes and formats read-only gamification stats and PRs
const progressModel = require('./progress.model');

/**
 * Retrieves progress summary for a user including streaks, tier, RP total, and breakdown by type
 * @param {string|number} userId
 * @returns {Promise<{rp_total: number, tier: string, current_streak: number, longest_streak: number, rp_breakdown: object}>}
 */
const getProgressSummary = async (userId) => {
  const userStats = await progressModel.getUserStats(userId);
  if (!userStats) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const breakdownRows = await progressModel.getRPBreakdown(userId);

  const rpBreakdown = {};
  if (Array.isArray(breakdownRows)) {
    for (const row of breakdownRows) {
      if (row && row.type) {
        rpBreakdown[row.type] = Number(row.total);
      }
    }
  }

  return {
    rp_total: userStats.rp_total,
    tier: userStats.tier,
    current_streak: userStats.current_streak,
    longest_streak: userStats.longest_streak,
    rp_breakdown: rpBreakdown,
  };
};

/**
 * Retrieves personal records (PRs) for a user grouped by sport_id
 * @param {string|number} userId
 * @returns {Promise<Record<string, Array<object>>>}
 */
const getUserPRs = async (userId) => {
  const prRows = await progressModel.getUserPRs(userId);

  const groupedPRs = {};

  if (Array.isArray(prRows)) {
    for (const row of prRows) {
      const sportKey = String(row.sport_id);
      if (!groupedPRs[sportKey]) {
        groupedPRs[sportKey] = [];
      }

      groupedPRs[sportKey].push({
        id: row.id,
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        metric: row.metric,
        value: row.value,
        previous_best: row.previous_best,
        verification_status: row.verification_status,
        created_at: row.created_at,
      });
    }
  }

  return groupedPRs;
};

module.exports = {
  getProgressSummary,
  getUserPRs,
};
