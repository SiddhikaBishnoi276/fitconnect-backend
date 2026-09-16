// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const router = express.Router();

const planRoutes = require('../modules/plan/plan.routes');

// Module routes registration
router.use('/plans', planRoutes);

module.exports = router;
