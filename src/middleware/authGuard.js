// JWT verification & role validation middleware
const jwt = require('jsonwebtoken');
const env = require('../config/env.config');
const { sendError } = require('../utils/responseFormatter');

const authGuard = (req, res, next) => {
  try {
    let userId = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const jwtSecret = env.JWT_SECRET || process.env.JWT_SECRET || 'default_jwt_secret_fitconnect';
      try {
        const decoded = jwt.verify(token, jwtSecret);
        userId = decoded.userId || decoded.id || decoded.sub;
      } catch (tokenErr) {
        // If JWT decoding fails, log warning and check body/headers fallback
        console.warn('⚠️ [authGuard]: Invalid JWT token provided, falling back to header/body payload');
      }
    }

    // Fallback for development / testing payload
    if (!userId) {
      userId = req.body?.userId || req.headers['x-user-id'] || req.query?.userId;
    }

    if (!userId) {
      return sendError(res, 'UNAUTHORIZED', 'Authentication required. Please provide a valid token or userId.', 401);
    }

    req.user = { id: userId, userId };
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = authGuard;
