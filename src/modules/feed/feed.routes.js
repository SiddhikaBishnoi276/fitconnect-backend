/**
 * Feed Routes - Express route definitions for social feed, posts, drafting, and likes.
 */
const express = require('express');
const router = express.Router();
const feedController = require('./feed.controller');
const authGuard = require('../../middleware/authGuard');

// Full-path routes (when mounted directly on master router at root)
router.post('/social/feed/posts/draft', authGuard, feedController.draftPost);
router.post('/social/feed/posts', authGuard, feedController.create);
router.get('/social/feed', authGuard, feedController.getFeed);
router.delete('/social/feed/posts/:postId', authGuard, feedController.remove);
router.post('/social/feed/posts/:postId/like', authGuard, feedController.like);
router.delete('/social/feed/posts/:postId/like', authGuard, feedController.unlike);

// Relative-path routes (when mounted at /social/feed)
router.post('/posts/draft', authGuard, feedController.draftPost);
router.post('/posts', authGuard, feedController.create);
router.get('/', authGuard, feedController.getFeed);
router.delete('/posts/:postId', authGuard, feedController.remove);
router.post('/posts/:postId/like', authGuard, feedController.like);
router.delete('/posts/:postId/like', authGuard, feedController.unlike);

module.exports = router;
