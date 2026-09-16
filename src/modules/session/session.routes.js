// Session routes: defines endpoints for active workout sessions (/sessions)
const express = require('express');
const router = express.Router();
const sessionController = require('./session.controller');
const authGuard = require('../../middleware/authGuard');

// All session endpoints are protected by authGuard
router.use(authGuard);

// 1. Pre-session check-in & start session
router.post('/', sessionController.createSessionHandler);

// 2. Crash recovery - get active in_progress session (Must be defined before /:id)
router.get('/active', sessionController.getActiveSessionHandler);

// 3. Full active-session view by ID
router.get('/:id', sessionController.getSessionByIdHandler);

// 4. Mid-workout feedback
router.post('/:id/exercises/:exerciseId/feedback', sessionController.submitExerciseFeedbackHandler);

// 5. Complete session
router.post('/:id/complete', sessionController.completeSessionHandler);

// 6. Cancel session
router.post('/:id/cancel', sessionController.cancelSessionHandler);

module.exports = router;
