// Auth service: password hashing, JWT token creation, and credentials verification
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const env = require('../../config/env.config');
const authModel = require('./auth.model');

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
    { expiresIn: env.JWT_EXPIRES_IN || '7d' }
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
  sports = [],
  injuries = [],
  ...otherProps
}) => {
  // 1. Duplicate email check
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
    { expiresIn: env.JWT_EXPIRES_IN || '7d' }
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

module.exports = {
  generateAuthTokens,
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
};
