// Profile routes: defines endpoints for user profile (/api/v1/profile)
const express = require('express');
const profileController = require('./profile.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

/**
 * @route   GET /api/v1/profile/me
 * @desc    Get current user profile header summary & sports
 * @access  Protected
 */
router.get('/me', authGuard, profileController.getMe);

/**
 * @route   PATCH /api/v1/profile/me
 * @desc    Update basic editable user profile fields
 * @access  Protected
 */
router.patch('/me', authGuard, profileController.updateMe);

/**
 * @route   PUT /api/v1/profile/injuries
 * @desc    Replace all user injuries
 * @access  Protected
 */
router.put('/injuries', authGuard, profileController.updateInjuries);

/**
 * @route   PATCH /api/v1/profile/preferences
 * @desc    Update user diet, cuisine, and privacy preferences
 * @access  Protected
 */
router.patch('/preferences', authGuard, profileController.updatePreferences);

/**
 * @route   GET /api/v1/profile/records
 * @desc    Get best personal records per exercise
 * @access  Protected
 */
router.get('/records', authGuard, profileController.getRecords);

module.exports = router;
