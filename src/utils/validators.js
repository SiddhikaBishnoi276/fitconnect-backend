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

/**
 * Validates refresh token payload
 * @param {object} body
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateRefreshTokenInput = (body) => {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { refreshToken } = body;

  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    return { isValid: false, error: 'refreshToken is required and must be a non-empty string' };
  }

  return { isValid: true };
};

/**
 * Validates forgot password payload
 * @param {object} body
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateForgotPasswordInput = (body) => {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { email } = body;

  if (!email || !isValidEmail(email)) {
    return { isValid: false, error: 'A valid email address is required' };
  }

  return { isValid: true };
};

/**
 * Validates OTP verification payload
 * @param {object} body
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateVerifyOtpInput = (body) => {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { email, otp } = body;

  if (!email || !isValidEmail(email)) {
    return { isValid: false, error: 'A valid email address is required' };
  }

  if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
    return { isValid: false, error: 'A valid 6-digit OTP is required' };
  }

  return { isValid: true };
};

/**
 * Validates reset password payload
 * @param {object} body
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateResetPasswordInput = (body) => {
  if (!body) {
    return { isValid: false, error: 'Request body is required' };
  }

  const { email, otp, newPassword } = body;

  if (!email || !isValidEmail(email)) {
    return { isValid: false, error: 'A valid email address is required' };
  }

  if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
    return { isValid: false, error: 'A valid 6-digit OTP is required' };
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return { isValid: false, error: 'New password is required and must be at least 6 characters long' };
  }

  return { isValid: true };
};

module.exports = {
  isValidEmail,
  validateSignupInput,
  validateLoginInput,
  validateRefreshTokenInput,
  validateForgotPasswordInput,
  validateVerifyOtpInput,
  validateResetPasswordInput,
};

