// Progress controller: HTTP handlers for gamification stats and PRs
const progressService = require('./progress.service');
const { sendSuccess, sendError } = require('../../utils/responseFormatter');

/**
 * Get progress summary (RP total, tier, streaks, RP breakdown) for the authenticated user
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getMe = async (req, res, next) => {
  try {
    const summary = await progressService.getProgressSummary(req.user.id);
    return sendSuccess(res, summary);
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') {
      return sendError(res, 'USER_NOT_FOUND', 'User not found', 404);
    }
    next(err);
  }
};

/**
 * Get personal records (PRs) grouped by sport for the authenticated user
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getPRs = async (req, res, next) => {
  try {
    const prs = await progressService.getUserPRs(req.user.id);
    return sendSuccess(res, prs);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMe,
  getPRs,
};
