/**
 * Follow Model - Raw PostgreSQL database queries for the follow module.
 */
const db = require('../../config/db');

/**
 * Creates a follow relationship (idempotent via ON CONFLICT DO NOTHING).
 * @param {string} followerId - ID of user initiating the follow
 * @param {string} followingId - ID of user to be followed
 * @returns {Promise<void>}
 */
async function createFollow(followerId, followingId) {
  const text = `
    INSERT INTO follows (follower_id, following_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `;
  await db.query(text, [followerId, followingId]);
}

/**
 * Removes a follow relationship (idempotent).
 * @param {string} followerId - ID of user unfollowing
 * @param {string} followingId - ID of user being unfollowed
 * @returns {Promise<void>}
 */
async function deleteFollow(followerId, followingId) {
  const text = `
    DELETE FROM follows
    WHERE follower_id = $1 AND following_id = $2
  `;
  await db.query(text, [followerId, followingId]);
}

/**
 * Checks if followerId is following followingId.
 * @param {string} followerId
 * @param {string} followingId
 * @returns {Promise<boolean>}
 */
async function isFollowing(followerId, followingId) {
  const text = `
    SELECT EXISTS (
      SELECT 1 FROM follows
      WHERE follower_id = $1 AND following_id = $2
    ) AS following
  `;
  const result = await db.query(text, [followerId, followingId]);
  return Boolean(result.rows[0]?.following);
}

/**
 * Retrieves the list of users following a given userId.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
async function getFollowers(userId) {
  const text = `
    SELECT u.id, u.name, u.username, u.tier, u.photo_url
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = $1
    ORDER BY f.created_at DESC
  `;
  const result = await db.query(text, [userId]);
  return result.rows || [];
}

/**
 * Retrieves the list of users that a given userId is following.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
async function getFollowing(userId) {
  const text = `
    SELECT u.id, u.name, u.username, u.tier, u.photo_url
    FROM follows f
    JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = $1
    ORDER BY f.created_at DESC
  `;
  const result = await db.query(text, [userId]);
  return result.rows || [];
}

/**
 * Searches public users by username prefix (case-insensitive, utilizes idx_users_username_lower index).
 * @param {string} queryStr - Username search term
 * @param {string} currentUserId - Exclude current user from results
 * @returns {Promise<Array<Object>>}
 */
async function searchByUsername(queryStr, currentUserId) {
  const text = `
    SELECT id, name, username, tier, photo_url
    FROM users
    WHERE LOWER(username) LIKE LOWER($1) || '%'
      AND id != $2
      AND privacy = 'public'
    ORDER BY username ASC
    LIMIT 20
  `;
  const result = await db.query(text, [queryStr, currentUserId]);
  return result.rows || [];
}

/**
 * Generates ranked recommendations based on shared sports, tier, activity level, and diet preference.
 * @param {string} currentUserId
 * @param {{ tier: string, activity_level: string, diet_preference: string }} currentUserProfile
 * @returns {Promise<Array<Object>>}
 */
async function getRecommendations(currentUserId, currentUserProfile) {
  const text = `
    SELECT 
      u.id, u.name, u.username, u.tier, u.photo_url,
      (
        (COUNT(DISTINCT us_match.sport_id) * 40) +
        (CASE WHEN u.tier = $2 THEN 25 ELSE 0 END) +
        (CASE WHEN u.activity_level = $3 THEN 15 ELSE 0 END) +
        (CASE WHEN u.diet_preference = $4 THEN 5 ELSE 0 END)
      ) AS match_score
    FROM users u
    JOIN user_sports us ON us.user_id = u.id
    LEFT JOIN user_sports us_match ON us_match.user_id = u.id 
      AND us_match.sport_id IN (
        SELECT sport_id FROM user_sports WHERE user_id = $1
      )
    WHERE u.id != $1
      AND u.privacy = 'public'
      AND u.id NOT IN (
        SELECT following_id FROM follows WHERE follower_id = $1
      )
    GROUP BY u.id
    HAVING (
      (COUNT(DISTINCT us_match.sport_id) * 40) +
      (CASE WHEN u.tier = $2 THEN 25 ELSE 0 END) +
      (CASE WHEN u.activity_level = $3 THEN 15 ELSE 0 END) +
      (CASE WHEN u.diet_preference = $4 THEN 5 ELSE 0 END)
    ) > 0
    ORDER BY match_score DESC
    LIMIT 10;
  `;
  const params = [
    currentUserId,
    currentUserProfile.tier,
    currentUserProfile.activity_level,
    currentUserProfile.diet_preference
  ];
  const result = await db.query(text, params);
  return result.rows || [];
}

/**
 * Cold-start fallback recommendation query for when getRecommendations returns zero rows.
 * @param {string} currentUserId
 * @returns {Promise<Array<Object>>}
 */
async function getRecommendationsFallback(currentUserId) {
  const text = `
    SELECT id, name, username, tier, photo_url
    FROM users 
    WHERE id != $1 AND privacy = 'public'
      AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = $1)
    ORDER BY created_at DESC 
    LIMIT 10
  `;
  const result = await db.query(text, [currentUserId]);
  return result.rows || [];
}

/**
 * Retrieves the count of followers for a given user.
 * @param {string|number} userId
 * @returns {Promise<number>}
 */
async function getFollowersCount(userId) {
  const text = `
    SELECT COUNT(*) AS count
    FROM follows
    WHERE following_id = $1
  `;
  const result = await db.query(text, [userId]);
  return parseInt(result.rows[0]?.count || 0, 10);
}

/**
 * Retrieves the count of users that a given user is following.
 * @param {string|number} userId
 * @returns {Promise<number>}
 */
async function getFollowingCount(userId) {
  const text = `
    SELECT COUNT(*) AS count
    FROM follows
    WHERE follower_id = $1
  `;
  const result = await db.query(text, [userId]);
  return parseInt(result.rows[0]?.count || 0, 10);
}

module.exports = {
  createFollow,
  deleteFollow,
  isFollowing,
  getFollowers,
  getFollowing,
  getFollowersCount,
  getFollowingCount,
  searchByUsername,
  getRecommendations,
  getRecommendationsFallback,
};
