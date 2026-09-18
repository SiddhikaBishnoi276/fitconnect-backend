/**
 * Feed Controller - Handles HTTP requests and responses for social feed and posts.
 */
const feedService = require('./feed.service');
const { sendSuccess, sendError } = require('../../utils/responseFormatter');

/**
 * Drafts an AI caption for a completed workout session.
 */
async function draftPost(req, res, next) {
  try {
    const draft = await feedService.generateDraftCaption(req.body.session_id, req.user.id);
    return sendSuccess(res, draft);
  } catch (err) {
    if (err.message === 'SESSION_NOT_FOUND') {
      return sendError(res, 'SESSION_NOT_FOUND', 'Session not found', 404);
    }
    next(err);
  }
}

/**
 * Creates a new user post.
 */
async function create(req, res, next) {
  try {
    const { type, caption, photo_url, session_id, pr_id } = req.body;
    const post = await feedService.createPost(req.user.id, {
      type,
      caption,
      photoUrl: photo_url,
      sessionId: session_id,
      prId: pr_id,
    });
    return sendSuccess(res, post);
  } catch (err) {
    if (err.message === 'INVALID_POST_TYPE') {
      return sendError(res, 'INVALID_POST_TYPE', 'Invalid post type', 400);
    }
    if (err.message === 'CAPTION_TOO_LONG') {
      return sendError(res, 'CAPTION_TOO_LONG', 'Caption must be under 500 characters', 400);
    }
    next(err);
  }
}

/**
 * Fetches feed posts with tab filtering and pagination.
 */
async function getFeed(req, res, next) {
  try {
    const tab = req.query.tab || 'global';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const posts = await feedService.getFeed(tab, req.user.id, page, limit);
    return sendSuccess(res, posts);
  } catch (err) {
    if (err.message === 'INVALID_TAB') {
      return sendError(res, 'INVALID_TAB', "tab must be 'global' or 'following'", 400);
    }
    next(err);
  }
}

/**
 * Likes a post.
 */
async function like(req, res, next) {
  try {
    const result = await feedService.likePost(req.params.postId, req.user.id);
    return sendSuccess(res, result);
  } catch (err) {
    if (err.message === 'POST_NOT_FOUND') {
      return sendError(res, 'POST_NOT_FOUND', 'Post not found', 404);
    }
    next(err);
  }
}

/**
 * Unlikes a post.
 */
async function unlike(req, res, next) {
  try {
    const result = await feedService.unlikePost(req.params.postId, req.user.id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  draftPost,
  create,
  getFeed,
  like,
  unlike,
};
