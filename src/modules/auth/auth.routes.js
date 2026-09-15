// Auth routes: defines endpoints for authentication (/api/v1/auth)
const express = require('express');
const authController = require('./auth.controller');
const authGuard = require('../../middleware/authGuard');
const validateRequest = require('../../middleware/validateRequest');
const {
  validateSignupInput,
  validateLoginInput,
  validateRefreshTokenInput,
} = require('../../utils/validators');

const router = express.Router();

/**
 * @route   POST /api/v1/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', validateRequest(validateSignupInput), authController.signup);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and get JWT tokens
 * @access  Public
 */
router.post('/login', validateRequest(validateLoginInput), authController.login);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Generate a new access token using a valid refresh token
 * @access  Public
 */
router.post('/refresh-token', validateRequest(validateRefreshTokenInput), authController.refreshToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Invalidate user session and refresh token
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.post('/logout', authGuard, authController.logout);

module.exports = router;
