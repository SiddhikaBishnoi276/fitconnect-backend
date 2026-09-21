// Profile service: business logic, validation, and data aggregation for athlete profile
const db = require('../../config/db');
const profileModel = require('./profile.model');

const VALID_RECOVERY_STATUS = ['fully_healed', 'mostly_recovered', 'partially_recovered', 'ongoing'];
const VALID_DIET_PREFERENCE = ['veg', 'non_veg', 'vegan', 'eggetarian'];
const VALID_PRIVACY = ['public', 'private'];

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
 * Fetches athlete profile header summary and associated sports
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getProfileHeader = async (userId) => {
  const [summary, sports] = await Promise.all([
    profileModel.getUserProfileSummary(userId),
    profileModel.getUserSports(userId),
  ]);

  if (!summary) {
    throw createError('User profile not found', 'USER_NOT_FOUND', 404);
  }

  return {
    ...summary,
    sports: sports || [],
  };
};

/**
 * Validates and updates user's basic editable profile fields
 * @param {string} userId
 * @param {object} updates
 * @returns {Promise<object>}
 */
const updateProfile = async (userId, updates = {}) => {
  if (!updates || typeof updates !== 'object') {
    throw createError('No valid fields to update', 'VALIDATION_ERROR', 400);
  }

  const allowedFields = ['name', 'photo_url', 'age', 'weight_kg', 'height_cm'];
  const filteredUpdates = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field) && updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    throw createError('No valid fields to update', 'VALIDATION_ERROR', 400);
  }

  // Validate Name if provided
  if (filteredUpdates.name !== undefined) {
    if (typeof filteredUpdates.name !== 'string' || filteredUpdates.name.trim().length === 0) {
      throw createError('Name must be a non-empty string', 'VALIDATION_ERROR', 400);
    }
    filteredUpdates.name = filteredUpdates.name.trim();
  }

  // Validate Photo URL if provided
  if (filteredUpdates.photo_url !== undefined && filteredUpdates.photo_url !== null) {
    if (typeof filteredUpdates.photo_url !== 'string') {
      throw createError('Photo URL must be a valid string or null', 'VALIDATION_ERROR', 400);
    }
  }

  // Validate Age if provided (must be an integer, 0 < age < 100)
  if (filteredUpdates.age !== undefined) {
    const ageNum = Number(filteredUpdates.age);
    if (!Number.isInteger(ageNum) || ageNum <= 0 || ageNum >= 100) {
      throw createError('Age must be an integer between 1 and 99', 'VALIDATION_ERROR', 400);
    }
    filteredUpdates.age = ageNum;
  }

  // Validate Weight if provided (must be positive number)
  if (filteredUpdates.weight_kg !== undefined) {
    const weightNum = Number(filteredUpdates.weight_kg);
    if (isNaN(weightNum) || weightNum <= 0) {
      throw createError('Weight must be a positive number', 'VALIDATION_ERROR', 400);
    }
    filteredUpdates.weight_kg = weightNum;
  }

  // Validate Height if provided (must be positive number)
  if (filteredUpdates.height_cm !== undefined) {
    const heightNum = Number(filteredUpdates.height_cm);
    if (isNaN(heightNum) || heightNum <= 0) {
      throw createError('Height must be a positive number', 'VALIDATION_ERROR', 400);
    }
    filteredUpdates.height_cm = heightNum;
  }

  const updatedUser = await profileModel.updateUserProfile(userId, filteredUpdates);
  if (!updatedUser) {
    throw createError('User not found', 'USER_NOT_FOUND', 404);
  }

  return updatedUser;
};

/**
 * Validates and atomically replaces all injuries for a user
 * @param {string} userId
 * @param {Array<object>} injuriesArray
 * @returns {Promise<Array<object>>}
 */
const replaceInjuries = async (userId, injuriesArray) => {
  if (!Array.isArray(injuriesArray)) {
    throw createError('Injuries must be an array', 'VALIDATION_ERROR', 400);
  }

  // Validate each injury object
  for (let i = 0; i < injuriesArray.length; i++) {
    const item = injuriesArray[i];
    if (!item || typeof item !== 'object') {
      throw createError(`Invalid injury entry at index ${i}`, 'VALIDATION_ERROR', 400);
    }

    const bodyPart = item.body_part || item.bodyPart;
    const condition = item.condition || item.injury_type || item.injuryType;
    const recoveryStatus = item.recovery_status || item.recoveryStatus;

    if (!bodyPart || typeof bodyPart !== 'string' || bodyPart.trim().length === 0) {
      throw createError(`Injury at index ${i} requires a valid body_part`, 'VALIDATION_ERROR', 400);
    }

    if (!condition || typeof condition !== 'string' || condition.trim().length === 0) {
      throw createError(`Injury at index ${i} requires a valid condition`, 'VALIDATION_ERROR', 400);
    }

    if (!recoveryStatus || !VALID_RECOVERY_STATUS.includes(recoveryStatus)) {
      throw createError(
        `Injury at index ${i} has invalid recovery_status "${recoveryStatus}". Allowed values: ${VALID_RECOVERY_STATUS.join(', ')}`,
        'VALIDATION_ERROR',
        400
      );
    }
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Confirm user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!userCheck.rows[0]) {
      throw createError('User not found', 'USER_NOT_FOUND', 404);
    }

    const newInjuries = await profileModel.replaceUserInjuries(userId, injuriesArray, client);

    await client.query('COMMIT');
    return newInjuries;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Fetches user preference settings
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getPreferences = async (userId) => {
  const preferences = await profileModel.getUserPreferences(userId);
  if (!preferences) {
    throw createError('User preferences not found', 'USER_NOT_FOUND', 404);
  }
  return preferences;
};

/**
 * Validates and updates user preferences (diet, regional cuisine, privacy)
 * @param {string} userId
 * @param {object} updates
 * @returns {Promise<object>}
 */
const updatePreferences = async (userId, updates = {}) => {
  if (!updates || typeof updates !== 'object') {
    throw createError('No valid preference fields to update', 'VALIDATION_ERROR', 400);
  }

  const allowedFields = ['diet_preference', 'regional_cuisine', 'privacy'];
  const filteredUpdates = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field) && updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    throw createError('No valid preference fields to update', 'VALIDATION_ERROR', 400);
  }

  // Validate diet_preference
  if (filteredUpdates.diet_preference !== undefined) {
    if (!VALID_DIET_PREFERENCE.includes(filteredUpdates.diet_preference)) {
      throw createError(
        `Invalid diet_preference "${filteredUpdates.diet_preference}". Allowed values: ${VALID_DIET_PREFERENCE.join(', ')}`,
        'VALIDATION_ERROR',
        400
      );
    }
  }

  // Validate privacy
  if (filteredUpdates.privacy !== undefined) {
    if (!VALID_PRIVACY.includes(filteredUpdates.privacy)) {
      throw createError(
        `Invalid privacy setting "${filteredUpdates.privacy}". Allowed values: ${VALID_PRIVACY.join(', ')}`,
        'VALIDATION_ERROR',
        400
      );
    }
  }

  // Validate regional_cuisine
  if (filteredUpdates.regional_cuisine !== undefined && filteredUpdates.regional_cuisine !== null) {
    if (typeof filteredUpdates.regional_cuisine !== 'string') {
      throw createError('Regional cuisine must be a valid string or null', 'VALIDATION_ERROR', 400);
    }
    filteredUpdates.regional_cuisine = filteredUpdates.regional_cuisine.trim();
  }

  const updatedPreferences = await profileModel.updateUserPreferences(userId, filteredUpdates);
  if (!updatedPreferences) {
    throw createError('User not found', 'USER_NOT_FOUND', 404);
  }

  return updatedPreferences;
};

/**
 * Fetches best personal records (PRs) per exercise
 * @param {string} userId
 * @param {number|string|null} [sportId=null]
 * @returns {Promise<Array<object>>}
 */
const getPersonalRecords = async (userId, sportId = null) => {
  let parsedSportId = null;

  if (sportId !== null && sportId !== undefined && sportId !== '') {
    const num = Number(sportId);
    if (!Number.isInteger(num) || num <= 0 || isNaN(num)) {
      throw createError('Invalid sportId: must be a positive integer', 'INVALID_SPORT_ID', 400);
    }
    parsedSportId = num;
  }

  const records = await profileModel.getUserPersonalRecords(userId, parsedSportId);
  return records || [];
};

module.exports = {
  VALID_RECOVERY_STATUS,
  VALID_DIET_PREFERENCE,
  VALID_PRIVACY,
  getProfileHeader,
  updateProfile,
  replaceInjuries,
  getPreferences,
  updatePreferences,
  getPersonalRecords,
};
