// Ranking service: leaderboard aggregation and standing computation
const rankingModel = require('./ranking.model');

/**
 * Creates a formatted error object
 * @param {string} message
 * @param {string} code
 * @param {number} statusCode
 * @returns {Error}
 */
const createError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

/**
 * Get leaderboard by scope
 * @param {string} userId 
 * @param {string} scope - 'friends' or 'global'
 * @returns {Promise<Array<object>>}
 */
const getLeaderboard = async (userId, scope = 'global') => {
  if (scope === 'friends') {
    const ranking = await rankingModel.getFriendsRanking(userId);
    return ranking;
  } else if (scope === 'global') {
    // For 'global', it is tier-scoped. Fetch user tier first.
    const tier = await rankingModel.getUserTier(userId);
    if (!tier) {
      throw createError('User tier not found', 'USER_NOT_FOUND', 404);
    }
    const ranking = await rankingModel.getTierRanking(tier);
    return ranking;
  } else {
    throw createError('Invalid scope parameter. Use "friends" or "global".', 'VALIDATION_ERROR', 400);
  }
};

module.exports = {
  getLeaderboard,
};
