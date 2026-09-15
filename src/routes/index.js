// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const sportsRoutes = require('../modules/sports/sports.routes');
const exercisesRoutes = require('../modules/exercises/exercises.routes');

const router = express.Router();

// Register module routes
router.use('/auth', authRoutes);
router.use('/sports', sportsRoutes);
router.use('/exercises', exercisesRoutes);

module.exports = router;
