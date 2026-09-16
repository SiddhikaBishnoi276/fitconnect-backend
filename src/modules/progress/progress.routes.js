// Progress routes: defines endpoints for gamification stats & PRs (/api/v1/progress)
const express = require('express');
const progressController = require('./progress.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

/**
 * @route   GET /api/v1/progress/me
 * @desc    Get progress summary (streaks, tier, RP total, RP breakdown) for the logged-in user
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.get('/me', authGuard, progressController.getMe);

/**
 * @route   GET /api/v1/progress/prs
 * @desc    Get personal records (PRs) grouped by sport for the logged-in user
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.get('/prs', authGuard, progressController.getPRs);

module.exports = router;
