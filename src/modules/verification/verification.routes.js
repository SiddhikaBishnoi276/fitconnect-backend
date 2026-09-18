// Verification routes: defines endpoints for activity verification (/api/v1/verification)
const express = require('express');
const verificationController = require('./verification.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

/**
 * @route   POST /api/v1/social/verification/prs/:prId/vote
 * @desc    Vote (genuine or flag) on a PR
 * @access  Protected
 */
router.post('/prs/:prId/vote', authGuard, verificationController.voteOnPR);

module.exports = router;
