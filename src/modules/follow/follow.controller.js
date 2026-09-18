/**
 * Follow Controller - Handles HTTP requests and formatting responses for follow operations.
 */
const followService = require('./follow.service');
const { sendSuccess, sendError } = require('../../utils/responseFormatter');

/**
 * Follow a user
 */
async function follow(req, res, next) {
  try {
    const result = await followService.followUser(req.user.id, req.params.userId);
    return sendSuccess(res, result);
  } catch (err) {
    if (err.message === 'CANNOT_FOLLOW_SELF') {
      return sendError(res, 'CANNOT_FOLLOW_SELF', 'You cannot follow yourself', 400);
    }
    next(err);
  }
}

/**
 * Unfollow a user
 */
async function unfollow(req, res, next) {
  try {
    const result = await followService.unfollowUser(req.user.id, req.params.userId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Get followers list of current user
 */
async function getFollowers(req, res, next) {
  try {
    const followers = await followService.getFollowersList(req.user.id);
    return sendSuccess(res, followers);
  } catch (err) {
    next(err);
  }
}

/**
 * Get following list of current user
 */
async function getFollowing(req, res, next) {
  try {
    const following = await followService.getFollowingList(req.user.id);
    return sendSuccess(res, following);
  } catch (err) {
    next(err);
  }
}

/**
 * Search users by username prefix
 */
async function search(req, res, next) {
  try {
    const results = await followService.searchUsers(req.query.q, req.user.id);
    return sendSuccess(res, results);
  } catch (err) {
    if (err.message === 'QUERY_TOO_SHORT') {
      return sendError(res, 'QUERY_TOO_SHORT', 'Search query must be at least 2 characters', 400);
    }
    next(err);
  }
}

/**
 * Get user recommendations
 */
async function getRecommendations(req, res, next) {
  try {
    const recommendations = await followService.getRecommendations(req.user.id);
    return sendSuccess(res, recommendations);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  follow,
  unfollow,
  getFollowers,
  getFollowing,
  search,
  getRecommendations
};
