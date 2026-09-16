// Plan routes: defines endpoints for workout plans (/api/v1/plans)
const express = require('express');
const router = express.Router();
const authGuard = require('../../middleware/authGuard');
const planController = require('./plan.controller');

// All plan endpoints require auth guard
router.use(authGuard);

// 1. POST /plans/generate (and POST /)
router.post('/generate', planController.generatePlanHandler);
router.post('/', planController.generatePlanHandler);

// 2. POST /plans/regenerate
router.post('/regenerate', planController.regeneratePlanHandler);

// 3. GET /plans/current
router.get('/current', planController.getCurrentPlanHandler);

// 4. GET /plans/current/days/:dayIndex
router.get('/current/days/:dayIndex', planController.getCurrentPlanDayHandler);

module.exports = router;
