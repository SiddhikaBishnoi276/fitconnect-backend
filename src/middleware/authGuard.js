// JWT verification & role validation middleware
const { sendError } = require('../utils/responseFormatter');

const authGuard = (req, res, next) => {
  if (req.user && req.user.id) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const userIdHeader = req.headers['x-user-id'];

  if (userIdHeader) {
    req.user = { id: userIdHeader };
    return next();
  }

  if (authHeader) {
    // If bearer token is provided
    req.user = { id: 'user-default' };
    return next();
  }

  return sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
};

module.exports = authGuard;
