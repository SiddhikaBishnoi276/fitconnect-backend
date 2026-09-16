// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const sportsRoutes = require('../modules/sports/sports.routes');
const exercisesRoutes = require('../modules/exercises/exercises.routes');

const router = express.Router();

const dietRoutes = require('../modules/diet/diet.routes');
const homeRoutes = require('../modules/home/home.routes');

// Mount module routes
router.use('/diet', dietRoutes);
router.use('/home', homeRoutes);
// Register module routes
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/sports', sportsRoutes);
router.use('/exercises', exercisesRoutes);

module.exports = router;
