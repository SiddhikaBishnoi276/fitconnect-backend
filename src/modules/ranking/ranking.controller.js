// Ranking controller: handles leaderboard fetch requests and global/tier leaderboard requests
const rankingService = require('./ranking.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * Get leaderboard
 * @route GET /api/v1/ranking/leaderboard
 */
const getLeaderboard = async (req, res, next) => {
  try {
    const scope = req.query.scope || 'global';
    const leaderboard = await rankingService.getLeaderboard(req.user.id, scope);
    return sendSuccess(res, leaderboard, 'Leaderboard fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getLeaderboard,
};
