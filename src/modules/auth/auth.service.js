// Auth service: password hashing, JWT token creation, and credentials verification
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const env = require('../../config/env.config');
const authModel = require('./auth.model');
const otpManager = require('../../utils/otpManager');
const emailService = require('../../utils/emailService');

const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;

/**
 * Generates Access and Refresh JWT tokens
 * @param {string} userId
 * @returns {{ accessToken: string, refreshToken: string, expiresAt: Date }}
 */
const generateAuthTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const refreshToken = jwt.sign(
    { userId },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    accessToken,
    refreshToken,
    expiresAt,
  };
};

/**
 * Registers a new user along with optional sports and injuries inside a database transaction
 * @param {object} payload
 * @returns {Promise<object>}
 */
const registerUser = async ({
  name,
  email,
  password,
  username,
  sports = [],
  injuries = [],
  ...otherProps
}) => {
  // 1. Duplicate username check
  const existingUserByUsername = await authModel.findUserByUsername(username);
  if (existingUserByUsername) {
    const error = new Error('A user with this username already exists');
    error.code = 'USERNAME_ALREADY_EXISTS';
    error.statusCode = 409;
    throw error;
  }

  // 1b. Duplicate email check
  const existingUser = await authModel.findUserByEmail(email);
  if (existingUser) {
    const error = new Error('A user with this email address already exists');
    error.code = 'EMAIL_ALREADY_EXISTS';
    error.statusCode = 409;
    throw error;
  }

  // 2. Hash password with bcrypt
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // 3. Execute insertion in a database transaction
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const createdUser = await authModel.createUser(
      {
        name,
        email,
        username,
        password_hash: passwordHash,
        ...otherProps,
      },
      client
    );

    let attachedSports = [];
    if (sports && sports.length > 0) {
      attachedSports = await authModel.addUserSports(createdUser.id, sports, client);
    }

    let attachedInjuries = [];
    if (injuries && injuries.length > 0) {
      attachedInjuries = await authModel.addUserInjuries(createdUser.id, injuries, client);
    }

    await client.query('COMMIT');

    // 4. Exclude password_hash from the returned user object
    const { password_hash, ...sanitizedUser } = createdUser;
    
    // Generate auth tokens and create device token
    const { accessToken, refreshToken, expiresAt } = generateAuthTokens(createdUser.id);
    await authModel.createDeviceToken(createdUser.id, refreshToken, otherProps.deviceInfo || null, expiresAt);

    return {
      accessToken,
      refreshToken,
      user: {
        ...sanitizedUser,
        sports: attachedSports,
        injuries: attachedInjuries,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Authenticates a user and generates auth tokens
 * @param {object} credentials
 * @returns {Promise<{ accessToken: string, refreshToken: string, user: object }>}
 */
const loginUser = async ({ email, password, deviceInfo = null }) => {
  if (!email || !password) {
    const error = new Error('Invalid email or password');
    error.code = 'INVALID_CREDENTIALS';
    error.statusCode = 401;
    throw error;
  }

  // 1. Find user by email
  const user = await authModel.findUserByEmail(email);
  if (!user || !user.password_hash) {
    const error = new Error('Invalid email or password');
    error.code = 'INVALID_CREDENTIALS';
    error.statusCode = 401;
    throw error;
  }

  // 2. Verify password with bcrypt
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.code = 'INVALID_CREDENTIALS';
    error.statusCode = 401;
    throw error;
  }

  // 3. Generate auth tokens (Access 15m, Refresh 7d)
  const { accessToken, refreshToken, expiresAt } = generateAuthTokens(user.id);

  // 4. Persist refresh token in DB
  await authModel.createDeviceToken(user.id, refreshToken, deviceInfo, expiresAt);

  // 5. Exclude password_hash from response
  const { password_hash, ...sanitizedUser } = user;

  return {
    accessToken,
    refreshToken,
    user: sanitizedUser,
  };
};

/**
 * Verifies a refresh token and generates a fresh access token
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string }>}
 */
const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken || typeof refreshToken !== 'string') {
    const error = new Error('Refresh token is required');
    error.code = 'INVALID_REFRESH_TOKEN';
    error.statusCode = 401;
    throw error;
  }

  // 1. Check if refresh token exists in DB and is not expired
  const tokenRecord = await authModel.findDeviceTokenByRefreshToken(refreshToken);
  if (!tokenRecord) {
    const error = new Error('Invalid or expired refresh token');
    error.code = 'INVALID_REFRESH_TOKEN';
    error.statusCode = 401;
    throw error;
  }

  // 2. Verify JWT signature & expiration
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch (err) {
    const error = new Error('Invalid or expired refresh token');
    error.code = 'INVALID_REFRESH_TOKEN';
    error.statusCode = 401;
    throw error;
  }

  const userId = decoded.userId || tokenRecord.user_id;

  // 3. Generate new access token (15m expiry)
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  return {
    accessToken,
  };
};

/**
 * Invalidates a user's session / refresh token
 * @param {string} refreshToken
 * @returns {Promise<void>}
 */
const logoutUser = async (refreshToken) => {
  if (refreshToken && typeof refreshToken === 'string') {
    await authModel.deleteDeviceToken(refreshToken);
  }
};

/**
 * Fetches the currently authenticated user's profile
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getCurrentUser = async (userId) => {
  if (!userId) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const user = await authModel.findUserById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const { password_hash, ...sanitizedUser } = user;
  return sanitizedUser;
};

/**
 * Checks if a username is available
 * @param {string} username
 * @returns {Promise<{ available: boolean }>}
 */
const checkUsernameAvailability = async (username) => {
  if (!username) return { available: false };
  const user = await authModel.findUserByUsername(username);
  return { available: !user };
};

/**
 * Checks if an email is available
 * @param {string} email
 * @returns {Promise<{ available: boolean }>}
 */
const checkEmailAvailability = async (email) => {
  if (!email) return { available: false };
  const user = await authModel.findUserByEmail(email);
  return { available: !user };
};

/**
 * Initiates forgot password flow by generating and emailing a 6-digit OTP
 * @param {object} param0
 * @param {string} param0.email
 * @returns {Promise<{ email: string, expiresInMinutes: number }>}
 */
const forgotPassword = async ({ email }) => {
  if (!email) {
    const error = new Error('Email is required');
    error.code = 'EMAIL_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await authModel.findUserByEmail(normalizedEmail);

  if (!user) {
    const error = new Error('No user account found with this email address');
    error.code = 'USER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (user.auth_provider && user.auth_provider !== 'email' && !user.password_hash) {
    const error = new Error(`This account is registered via ${user.auth_provider}. Please sign in using ${user.auth_provider}.`);
    error.code = 'OAUTH_ACCOUNT';
    error.statusCode = 400;
    throw error;
  }

  // Create OTP (stored in memory, auto expires in 10 mins)
  const { otp } = otpManager.createOtp(normalizedEmail);

  // Send OTP email
  await emailService.sendPasswordResetOtpEmail(normalizedEmail, otp, 10);

  return {
    email: normalizedEmail,
    expiresInMinutes: 10,
  };
};

/**
 * Verifies if an OTP is valid without resetting the password yet
 * @param {object} param0
 * @param {string} param0.email
 * @param {string} param0.otp
 * @returns {Promise<{ valid: boolean }>}
 */
const verifyOtp = async ({ email, otp }) => {
  if (!email || !otp) {
    const error = new Error('Email and OTP are required');
    error.code = 'INVALID_INPUT';
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();
  otpManager.verifyOtp(normalizedEmail, otp);

  return {
    email: normalizedEmail,
    valid: true,
  };
};

/**
 * Resets user password using verified OTP
 * @param {object} param0
 * @param {string} param0.email
 * @param {string} param0.otp
 * @param {string} param0.newPassword
 * @returns {Promise<object>}
 */
const resetPassword = async ({ email, otp, newPassword }) => {
  if (!email || !otp || !newPassword) {
    const error = new Error('Email, OTP, and new password are required');
    error.code = 'INVALID_INPUT';
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Verify OTP
  otpManager.verifyOtp(normalizedEmail, otp);

  // 2. Fetch user
  const user = await authModel.findUserByEmail(normalizedEmail);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // 3. Hash new password
  const saltRounds = 10;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // 4. Update password in database
  await authModel.updateUserPassword(user.id, newPasswordHash);

  // 5. Invalidate all device tokens/active sessions
  await authModel.deleteAllDeviceTokensForUser(user.id);

  // 6. Clear OTP from memory
  otpManager.clearOtp(normalizedEmail);

  return {
    userId: user.id,
    email: normalizedEmail,
  };
};

module.exports = {
  generateAuthTokens,
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
  checkUsernameAvailability,
  checkEmailAvailability,
  forgotPassword,
  verifyOtp,
  resetPassword,
};

