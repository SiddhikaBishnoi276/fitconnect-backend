// Sports routes: defines endpoints for sports (/api/v1/sports)
const express = require('express');
const sportsController = require('./sports.controller');

const router = express.Router();

/**
 * @route   GET /api/v1/sports
 * @desc    Get all supported sports
 * @access  Public (No authGuard)
 */
router.get('/', sportsController.getSports);

module.exports = router;
