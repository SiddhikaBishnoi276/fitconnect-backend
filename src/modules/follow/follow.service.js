/**
 * Follow Service - Business logic for user follow relationships and recommendations.
 */
const followModel = require('./follow.model');
const { findUserById } = require('../auth/auth.model');
const notificationService = require('../notifications/notifications.service');

/**
 * Follows a target user directly.
 * @param {string} currentUserId
 * @param {string} targetUserId
 * @returns {Promise<{ following: boolean }>}
 */
async function followUser(currentUserId, targetUserId) {
  if (currentUserId === targetUserId) {
    throw new Error('CANNOT_FOLLOW_SELF');
  }

  const alreadyFollowing = await followModel.isFollowing(currentUserId, targetUserId);
  await followModel.createFollow(currentUserId, targetUserId);

  if (!alreadyFollowing) {
    try {
      const follower = await findUserById(currentUserId);
      await notificationService.notifyNewFollower(
        targetUserId,
        currentUserId,
        follower?.name || follower?.username || 'Someone'
      );
    } catch (err) {
      console.error('New follower notification failed:', err);
    }
  }

  return { following: true };
}

/**
 * Unfollows a target user.
 * @param {string} currentUserId
 * @param {string} targetUserId
 * @returns {Promise<{ following: boolean }>}
 */
async function unfollowUser(currentUserId, targetUserId) {
  await followModel.deleteFollow(currentUserId, targetUserId);
  return { following: false };
}

/**
 * Retrieves the list of followers for a given user.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
async function getFollowersList(userId) {
  return await followModel.getFollowers(userId);
}

/**
 * Retrieves the list of users that a given user is following.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
async function getFollowingList(userId) {
  return await followModel.getFollowing(userId);
}

/**
 * Searches users by username prefix.
 * @param {string} query
 * @param {string} currentUserId
 * @returns {Promise<Array<Object>>}
 */
async function searchUsers(query, currentUserId) {
  if (!query || query.trim().length < 2) {
    throw new Error('QUERY_TOO_SHORT');
  }

  return await followModel.searchByUsername(query.trim(), currentUserId);
}

/**
 * Retrieves ranked recommendations or falls back to cold-start results.
 * @param {string} currentUserId
 * @returns {Promise<Array<Object>>}
 */
async function getRecommendations(currentUserId) {
  const profile = await findUserById(currentUserId);
  
  const userProfile = {
    tier: profile?.tier || 'bronze',
    activity_level: profile?.activity_level || 'moderate',
    diet_preference: profile?.diet_preference || 'balanced'
  };

  const scoredResults = await followModel.getRecommendations(currentUserId, userProfile);

  if (!scoredResults || scoredResults.length === 0) {
    return await followModel.getRecommendationsFallback(currentUserId);
  }

  return scoredResults;
}

module.exports = {
  followUser,
  unfollowUser,
  getFollowersList,
  getFollowingList,
  searchUsers,
  getRecommendations
};
