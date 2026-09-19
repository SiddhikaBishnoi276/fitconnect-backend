// Verification service: anti-cheat engine, statistical trust-score computation, and GPS validation
const verificationModel = require('./verification.model');

const VALID_VOTES = ['genuine', 'flag'];

/**
 * Creates a formatted error object
 * @param {string} message
 * @param {string} code
 * @param {number} statusCode
 * @returns {Error}
 */
const createError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

/**
 * Cast a vote on a PR
 * @param {string} prId 
 * @param {string} voterId 
 * @param {string} vote 
 * @returns {Promise<object>}
 */
const castVote = async (prId, voterId, vote) => {
  if (!prId || typeof prId !== 'string') {
    throw createError('Valid prId is required', 'VALIDATION_ERROR', 400);
  }

  if (!VALID_VOTES.includes(vote)) {
    throw createError(`Invalid vote "${vote}". Allowed values: ${VALID_VOTES.join(', ')}`, 'VALIDATION_ERROR', 400);
  }

  const result = await verificationModel.castVote(prId, voterId, vote);
  return result;
};

module.exports = {
  castVote,
};
