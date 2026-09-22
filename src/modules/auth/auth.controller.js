// Auth controller: handles signup, login, refresh token, and logout requests
const authService = require('./auth.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * Controller handler for user registration
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const signup = async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body);
    return sendSuccess(res, user, 'Signup successful', 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler for user login
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const login = async (req, res, next) => {
  try {
    const data = await authService.loginUser(req.body);
    return sendSuccess(res, data, 'Login successful', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler for refreshing access token
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    const data = await authService.refreshAccessToken(token);
    return sendSuccess(res, data, 'Token refreshed', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler for user logout
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    await authService.logoutUser(token);
    return sendSuccess(res, null, 'Logged out successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler for fetching current authenticated user profile
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getMe = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const user = await authService.getCurrentUser(userId);
    return sendSuccess(res, user, 'User fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler to check if a username is available
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.query;
    const data = await authService.checkUsernameAvailability(username);
    return sendSuccess(res, data, 'Username availability check complete', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler to check if an email is available
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const checkEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    const data = await authService.checkEmailAvailability(email);
    return sendSuccess(res, data, 'Email availability check complete', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  signup,
  login,
  refreshToken,
  logout,
  getMe,
  checkUsername,
  checkEmail,
};
