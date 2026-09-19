// Profile controller: handles public athlete profile view, PR updates, and bio data
const profileService = require('./profile.service');
const { sendSuccess, sendError } = require('../../utils/responseFormatter');

/**
 * Get profile header, sports, and posts for current authenticated user
 * @route GET /api/v1/profile/me
 */
const getMe = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const profile = await profileService.getProfileHeader(req.user.id, page, limit);
    return sendSuccess(res, profile, 'Profile fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Update basic editable profile fields
 * @route PATCH /api/v1/profile/me
 */
const updateMe = async (req, res, next) => {
  try {
    const updatedProfile = await profileService.updateProfile(req.user.id, req.body);
    return sendSuccess(res, updatedProfile, 'Profile updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Replace all injuries for current user
 * @route PUT /api/v1/profile/injuries
 */
const updateInjuries = async (req, res, next) => {
  try {
    const injuriesArray = Array.isArray(req.body) ? req.body : (req.body && req.body.injuries !== undefined ? req.body.injuries : req.body);
    const injuries = await profileService.replaceInjuries(req.user.id, injuriesArray);
    return sendSuccess(res, injuries, 'Injuries updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Update user preferences (diet, regional cuisine, privacy)
 * @route PATCH /api/v1/profile/preferences
 */
const updatePreferences = async (req, res, next) => {
  try {
    const preferences = await profileService.updatePreferences(req.user.id, req.body);
    return sendSuccess(res, preferences, 'Preferences updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Get personal records (best per exercise)
 * @route GET /api/v1/profile/records
 */
const getRecords = async (req, res, next) => {
  try {
    const sportId = req.query.sport_id;
    const records = await profileService.getPersonalRecords(req.user.id, sportId);
    return sendSuccess(res, records, 'Personal records fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Get public profile of another user
 * @route GET /api/v1/profile/:userId
 */
const getUserProfile = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const profile = await profileService.getOtherUserProfile(
      req.user.id, req.params.userId, page, limit
    );
    return sendSuccess(res, profile);
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') {
      return sendError(res, 'USER_NOT_FOUND', 'User not found', 404);
    }
    next(err);
  }
};

module.exports = {
  getMe,
  updateMe,
  updateInjuries,
  updatePreferences,
  getRecords,
  getUserProfile,
};
