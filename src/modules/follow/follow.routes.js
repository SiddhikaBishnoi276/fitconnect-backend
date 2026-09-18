/**
 * Follow Routes - Express route definitions for social follow endpoints.
 */
const express = require('express');
const router = express.Router();
const followController = require('./follow.controller');
const authGuard = require('../../middleware/authGuard');

// Full-path routes (when mounted directly on master router)
router.get('/social/follow/followers', authGuard, followController.getFollowers);
router.get('/social/follow/following', authGuard, followController.getFollowing);
router.get('/social/follow/search', authGuard, followController.search);
router.get('/social/follow/recommendations', authGuard, followController.getRecommendations);
router.post('/social/follow/:userId', authGuard, followController.follow);
router.delete('/social/follow/:userId', authGuard, followController.unfollow);

// Relative-path routes (when mounted at /social/follow)
router.get('/followers', authGuard, followController.getFollowers);
router.get('/following', authGuard, followController.getFollowing);
router.get('/search', authGuard, followController.search);
router.get('/recommendations', authGuard, followController.getRecommendations);
router.post('/:userId', authGuard, followController.follow);
router.delete('/:userId', authGuard, followController.unfollow);

module.exports = router;
