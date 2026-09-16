// JWT verification & role validation middleware
const jwt = require('jsonwebtoken');
const env = require('../config/env.config');

const JWT_SECRET = env.JWT_SECRET;

/**
 * Middleware to authenticate requests via Bearer JWT token in Authorization header
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authGuard = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Authorization token is required');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    return next(error);
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    const error = new Error('Authorization token is required');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    return next(error);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      ...decoded,
    };
    next();
  } catch (err) {
    const error = new Error('Invalid or expired authentication token');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    return next(error);
  }
};

module.exports = authGuard;
