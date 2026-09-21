/**
 * Feed Service - Business logic for feed, posts, social drafting, and likes.
 */
const feedModel = require('./feed.model');
const { buildDraftCaptionPrompt } = require('./feed.prompts');
const llmClient = require('../../llm/llmClient');
const { findUserById } = require('../auth/auth.model');
const notificationService = require('../notifications/notifications.service');

const VALID_POST_TYPES = ['pr', 'achievement', 'photo', 'session_complete'];
const FALLBACK_CAPTION = 'Just finished a great session! 💪';

/**
 * Generates an AI-drafted social caption for a user's workout session.
 * @param {string|number} sessionId
 * @param {string|number} userId
 * @returns {Promise<{ draft_caption: string, session_id: string|number }>}
 */
async function generateDraftCaption(sessionId, userId) {
  const session = await feedModel.getSessionDetailsForDraft(sessionId, userId);

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  const { system, user } = buildDraftCaptionPrompt({
    sportName: session.sport_name || 'General Fitness',
    sessionType: session.session_type || 'Workout',
    durationMinutes: session.duration_min || 0,
    intensity: session.intensity || 'moderate',
    exercisesCompleted: session.exercises_completed || 0,
    totalExercises: session.total_exercises || 0,
  });

  let draftCaption = FALLBACK_CAPTION;

  try {
    const response = await llmClient.generate(system, user, {
      timeoutMs: 6000,
    });
    if (response && response.text && response.text.trim().length > 0) {
      draftCaption = response.text.trim().replace(/^["']|["']$/g, '');
    }
  } catch (err) {
    console.warn(`[Feed Service] Draft caption LLM generation failed: ${err.message}. Using fallback.`);
    draftCaption = FALLBACK_CAPTION;
  }

  return {
    draft_caption: draftCaption,
    session_id: sessionId,
  };
}

/**
 * Validates and creates a new user post.
 * @param {string|number} userId
 * @param {object} postPayload
 * @param {string} postPayload.type
 * @param {string} [postPayload.caption]
 * @param {string} [postPayload.photoUrl]
 * @param {string|number} [postPayload.sessionId]
 * @param {string|number} [postPayload.prId]
 * @returns {Promise<object>}
 */
async function createPost(userId, { type, caption, photoUrl, sessionId, prId } = {}) {
  if (!type || !VALID_POST_TYPES.includes(type)) {
    throw new Error('INVALID_POST_TYPE');
  }

  if (caption !== undefined && caption !== null) {
    if (typeof caption !== 'string' || caption.length > 500) {
      throw new Error('CAPTION_TOO_LONG');
    }
  }

  return await feedModel.createPost(userId, {
    type,
    caption,
    photoUrl,
    sessionId,
    prId,
  });
}

/**
 * Fetches feed posts (global or following) annotated with liked_by_me.
 * @param {string} tab - 'global' | 'following'
 * @param {string|number} currentUserId
 * @param {number|string} [page=1]
 * @param {number|string} [limit=20]
 * @returns {Promise<Array<object>>}
 */
async function getFeed(tab, currentUserId, page = 1, limit = 20) {
  if (tab !== 'global' && tab !== 'following') {
    throw new Error('INVALID_TAB');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let posts = [];
  if (tab === 'global') {
    posts = await feedModel.getGlobalFeed(limitNum, offset);
  } else {
    posts = await feedModel.getFollowingFeed(currentUserId, limitNum, offset);
  }

  const annotatedPosts = await Promise.all(
    posts.map(async (post) => {
      const likedByMe = await feedModel.checkLikedByUser(post.id, currentUserId);
      return {
        ...post,
        liked_by_me: likedByMe,
      };
    })
  );

  return annotatedPosts;
}

/**
 * Likes a post (idempotent) and returns updated like count and status.
 * @param {string|number} postId
 * @param {string|number} userId
 * @returns {Promise<{ post_id: string|number, liked_by_me: boolean, liked: boolean, like_count: number }>}
 */
async function likePost(postId, userId) {
  const post = await feedModel.getPostById(postId);
  if (!post) {
    throw new Error('POST_NOT_FOUND');
  }

  const alreadyLiked = await feedModel.checkLikedByUser(postId, userId);
  const likeCount = await feedModel.addLike(postId, userId);

  // Trigger notification only if liking someone else's post and not already liked
  if (post.user_id !== userId && !alreadyLiked) {
    try {
      const liker = await findUserById(userId);
      await notificationService.notifyPostLiked(
        post.user_id,
        userId,
        liker?.name || liker?.username || 'Someone',
        postId
      );
    } catch (err) {
      console.error('Post liked notification failed:', err);
    }
  }

  return {
    post_id: postId,
    liked_by_me: true,
    liked: true,
    like_count: Number(likeCount),
  };
}

/**
 * Unlikes a post (idempotent) and returns updated like count and status.
 * @param {string|number} postId
 * @param {string|number} userId
 * @returns {Promise<{ post_id: string|number, liked_by_me: boolean, liked: boolean, like_count: number }>}
 */
async function unlikePost(postId, userId) {
  const post = await feedModel.getPostById(postId);
  if (!post) {
    throw new Error('POST_NOT_FOUND');
  }

  const likeCount = await feedModel.removeLike(postId, userId);
  return {
    post_id: postId,
    liked_by_me: false,
    liked: false,
    like_count: Number(likeCount),
  };
}

/**
 * Deletes a post if owned by the user.
 * @param {string|number} postId
 * @param {string|number} userId
 * @returns {Promise<{ deleted: boolean }>}
 */
async function deletePost(postId, userId) {
  const deletedId = await feedModel.deletePost(postId, userId);
  if (!deletedId) {
    throw new Error('POST_NOT_FOUND_OR_NOT_OWNER');
  }
  return { deleted: true };
}

module.exports = {
  generateDraftCaption,
  createPost,
  getFeed,
  likePost,
  unlikePost,
  deletePost,
};
