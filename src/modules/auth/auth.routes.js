// Auth routes: defines endpoints for authentication (/api/v1/auth)
const express = require('express');
const authController = require('./auth.controller');
const validateRequest = require('../../middleware/validateRequest');
const { validateSignupInput, validateLoginInput } = require('../../utils/validators');

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

module.exports = router;
