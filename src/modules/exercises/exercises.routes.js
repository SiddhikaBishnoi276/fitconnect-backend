// Exercises routes: defines endpoints for exercise library (/api/v1/exercises)
const express = require('express');
const exercisesController = require('./exercises.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

/**
 * @route   GET /api/v1/exercises
 * @desc    Get all exercises or filter by ?sport_id=
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.get('/', authGuard, exercisesController.getExercises);

/**
 * @route   GET /api/v1/exercises/:id
 * @desc    Get single exercise details with substitutes
 * @access  Protected (Requires Bearer JWT in Authorization header)
 */
router.get('/:id', authGuard, exercisesController.getExerciseDetail);

module.exports = router;
