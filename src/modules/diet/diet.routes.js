/**
 * Diet Routes - Express route definitions for diet endpoints.
 */
const express = require('express');
const router = express.Router();
const dietController = require('./diet.controller');
const authGuard = require('../../middleware/authGuard');

// Sub-path routes (when mounted at /diet or /api/v1/diet)
router.post('/generate', authGuard, dietController.generate);
router.get('/today', authGuard, dietController.getToday);
router.get('/meals/:mealId', authGuard, dietController.getMeal);
router.get('/history', authGuard, dietController.getHistory);

// Full-path routes (when mounted at root /api/v1)
router.post('/diet/generate', authGuard, dietController.generate);
router.get('/diet/today', authGuard, dietController.getToday);
router.get('/diet/meals/:mealId', authGuard, dietController.getMeal);
router.get('/diet/history', authGuard, dietController.getHistory);

module.exports = router;
