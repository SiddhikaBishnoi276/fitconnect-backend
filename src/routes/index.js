// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const router = express.Router();

const planRoutes = require('../modules/plan/plan.routes');
const sessionRoutes = require('../modules/session/session.routes');

// Module routes registration
router.use('/plans', planRoutes);
router.use('/sessions', sessionRoutes);

module.exports = router;
