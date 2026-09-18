// Ranking routes: defines endpoints for leaderboard (/api/v1/ranking)
const express = require('express');
const rankingController = require('./ranking.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

/**
 * @route   GET /api/v1/ranking/leaderboard
 * @desc    Get leaderboard (friends or global scope)
 * @access  Protected
 */
router.get('/leaderboard', authGuard, rankingController.getLeaderboard);

module.exports = router;
