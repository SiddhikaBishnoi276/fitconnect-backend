// Custom input format validators
/**
 * Checks if a given string is a valid email address.
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validates signup payload
 * @param {object} body
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateSignupInput = (body) => {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { name, email, password } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { isValid: false, error: 'Name is required and must be a non-empty string' };
  }

  if (!email || !isValidEmail(email)) {
    return { isValid: false, error: 'A valid email address is required' };
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return { isValid: false, error: 'Password is required and must be at least 6 characters long' };
  }

  return { isValid: true };
};

/**
 * Validates login payload
 * @param {object} body
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateLoginInput = (body) => {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { email, password } = body;

  if (!email || !isValidEmail(email)) {
    return { isValid: false, error: 'A valid email address is required' };
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    return { isValid: false, error: 'Password is required' };
  }

  return { isValid: true };
};

module.exports = {
  isValidEmail,
  validateSignupInput,
  validateLoginInput,
};
