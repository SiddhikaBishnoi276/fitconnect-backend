// Standardized API response wrappers ({ success, data, error })

/**
 * Send standard success API response
 * @param {import('express').Response} res
 * @param {any} data
 * @param {string} [message]
 * @param {number} [statusCode=200]
 */
const sendSuccess = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
};

/**
 * Send standard error API response
 * @param {import('express').Response} res
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode=500]
 */
const sendError = (res, code = 'INTERNAL_ERROR', message = 'An error occurred', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
