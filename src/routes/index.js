// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const sportsRoutes = require('../modules/sports/sports.routes');
const exercisesRoutes = require('../modules/exercises/exercises.routes');

const router = express.Router();

const dietRoutes = require('../modules/diet/diet.routes');
const homeRoutes = require('../modules/home/home.routes');
const progressRoutes = require('../modules/progress/progress.routes');

// Mount module routes
router.use('/diet', dietRoutes);
router.use('/home', homeRoutes);
router.use('/progress', progressRoutes);
// Register module routes
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/sports', sportsRoutes);
router.use('/exercises', exercisesRoutes);
const planRoutes = require('../modules/plan/plan.routes');
const sessionRoutes = require('../modules/session/session.routes');
const verificationRoutes = require('../modules/verification/verification.routes');
const rankingRoutes = require('../modules/ranking/ranking.routes');

// Module routes registration
router.use('/plans', planRoutes);
router.use('/sessions', sessionRoutes);
router.use('/social/verification', verificationRoutes);
router.use('/ranking', rankingRoutes);

module.exports = router;
