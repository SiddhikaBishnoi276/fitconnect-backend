/**
 * Feed Model - Raw PostgreSQL database queries for posts, feeds, and likes.
 */
const db = require('../../config/db');

/**
 * Creates a new post in the database.
 * @param {string|number} userId
 * @param {object} postData
 * @param {string} postData.type - 'pr' | 'achievement' | 'photo' | 'session_complete'
 * @param {string} [postData.caption]
 * @param {string} [postData.photoUrl]
 * @param {string|number} [postData.sessionId]
 * @param {string|number} [postData.prId]
 * @returns {Promise<object>} Created post row
 */
async function createPost(userId, { type, caption, photoUrl, sessionId, prId } = {}) {
  const text = `
    INSERT INTO posts (user_id, type, caption, photo_url, session_id, pr_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [
    userId,
    type,
    caption ?? null,
    photoUrl ?? null,
    sessionId ?? null,
    prId ?? null,
  ];
  const result = await db.query(text, values);
  return result.rows[0];
}

/**
 * Fetches a single post by ID.
 * @param {string|number} postId
 * @returns {Promise<object|null>} Post row or null if not found
 */
async function getPostById(postId) {
  const text = `
    SELECT *
    FROM posts
    WHERE id = $1
  `;
  const result = await db.query(text, [postId]);
  return result.rows[0] || null;
}

/**
 * Fetches the global feed of posts from public users.
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array<object>>}
 */
async function getGlobalFeed(limit, offset) {
  const text = `
    SELECT 
      p.id, p.type, p.caption, p.photo_url, p.likes_count, 
      p.created_at, p.session_id, p.pr_id,
      u.id AS author_id, u.name AS author_name, 
      u.username AS author_username, u.photo_url AS author_photo_url
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE u.privacy = 'public'
    ORDER BY p.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await db.query(text, [limit, offset]);
  return result.rows || [];
}

/**
 * Fetches the feed of posts from users that currentUserId follows.
 * Note: No privacy filter is applied per spec.
 * @param {string|number} currentUserId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array<object>>}
 */
async function getFollowingFeed(currentUserId, limit, offset) {
  const text = `
    SELECT 
      p.id, p.type, p.caption, p.photo_url, p.likes_count, 
      p.created_at, p.session_id, p.pr_id,
      u.id AS author_id, u.name AS author_name, 
      u.username AS author_username, u.photo_url AS author_photo_url
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = $3
    )
    ORDER BY p.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await db.query(text, [limit, offset, currentUserId]);
  return result.rows || [];
}

/**
 * Fetches posts by a specific user (used by profile-viewing feature).
 * @param {string|number} userId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array<object>>}
 */
async function getPostsByUser(userId, limit, offset) {
  const text = `
    SELECT id, type, caption, photo_url, likes_count, created_at, 
           session_id, pr_id
    FROM posts
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await db.query(text, [userId, limit, offset]);
  return result.rows || [];
}

/**
 * Checks if a specific post is liked by a given user.
 * @param {string|number} postId
 * @param {string|number} userId
 * @returns {Promise<boolean>}
 */
async function checkLikedByUser(postId, userId) {
  const text = `
    SELECT EXISTS(
      SELECT 1 FROM likes 
      WHERE post_id = $1 AND user_id = $2
    ) AS liked
  `;
  const result = await db.query(text, [postId, userId]);
  return Boolean(result.rows[0]?.liked);
}

/**
 * Adds a like to a post (idempotent via ON CONFLICT DO NOTHING).
 * Database trigger automatically syncs posts.likes_count.
 * @param {string|number} postId
 * @param {string|number} userId
 * @returns {Promise<void>}
 */
async function addLike(postId, userId) {
  const text = `
    INSERT INTO likes (post_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `;
  await db.query(text, [postId, userId]);
}

/**
 * Removes a like from a post (idempotent).
 * Database trigger automatically syncs posts.likes_count.
 * @param {string|number} postId
 * @param {string|number} userId
 * @returns {Promise<void>}
 */
async function removeLike(postId, userId) {
  const text = `
    DELETE FROM likes
    WHERE post_id = $1 AND user_id = $2
  `;
  await db.query(text, [postId, userId]);
}

/**
 * Fetches session details for generating a draft social caption.
 * Ensures the session belongs to the requesting userId.
 * @param {string|number} sessionId
 * @param {string|number} userId
 * @returns {Promise<object|null>}
 */
async function getSessionDetailsForDraft(sessionId, userId) {
  const text = `
    SELECT 
      s.id AS session_id,
      s.duration_min,
      s.exercises_completed,
      pd.session_type,
      pd.intensity,
      COALESCE(sp.name, 'General Fitness') AS sport_name,
      COALESCE(
        (SELECT COUNT(*)::int FROM plan_day_exercises pde WHERE pde.plan_day_id = pd.id),
        0
      ) AS total_exercises
    FROM sessions s
    LEFT JOIN plan_days pd ON pd.id = s.plan_day_id
    LEFT JOIN sports sp ON sp.id = pd.sport_id
    WHERE s.id = $1 AND s.user_id = $2
  `;
  const result = await db.query(text, [sessionId, userId]);
  return result.rows[0] || null;
}

module.exports = {
  createPost,
  getPostById,
  getGlobalFeed,
  getFollowingFeed,
  getPostsByUser,
  checkLikedByUser,
  addLike,
  removeLike,
  getSessionDetailsForDraft,
};

