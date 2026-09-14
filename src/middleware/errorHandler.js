// Global centralized error handler
const { sendError } = require('../utils/responseFormatter');

// Express error-handling middleware must take 4 arguments: (err, req, res, next)
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected server error occurred';

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  return sendError(res, errorCode, message, statusCode);
};

module.exports = errorHandler;
