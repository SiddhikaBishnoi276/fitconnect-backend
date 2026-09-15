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

module.exports = {
  signup,
  login,
};
