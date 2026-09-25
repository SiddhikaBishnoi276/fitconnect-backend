// Auth routes: defines endpoints for authentication (/api/v1/auth)
const express = require('express');
const authController = require('./auth.controller');
const authGuard = require('../../middleware/authGuard');
const validateRequest = require('../../middleware/validateRequest');
const {
  validateSignupInput,
  validateLoginInput,
  validateRefreshTokenInput,
  validateForgotPasswordInput,
  validateVerifyOtpInput,
  validateResetPasswordInput,
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
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send password reset OTP to user email
 * @access  Public
 */
router.post('/forgot-password', validateRequest(validateForgotPasswordInput), authController.forgotPassword);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify 6-digit OTP for password reset
 * @access  Public
 */
router.post('/verify-otp', validateRequest(validateVerifyOtpInput), authController.verifyOtp);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using OTP
 * @access  Public
 */
router.post('/reset-password', validateRequest(validateResetPasswordInput), authController.resetPassword);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user profile
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.get('/me', authGuard, authController.getMe);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Invalidate user session and refresh token
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.post('/logout', authGuard, authController.logout);

/**
 * @route   GET /api/v1/auth/check-username
 * @desc    Check if username is available
 * @access  Public
 */
router.get('/check-username', authController.checkUsername);

/**
 * @route   GET /api/v1/auth/check-email
 * @desc    Check if email is available
 * @access  Public
 */
router.get('/check-email', authController.checkEmail);

module.exports = router;

