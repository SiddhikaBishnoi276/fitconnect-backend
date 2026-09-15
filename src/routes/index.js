// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const router = express.Router();

const dietRoutes = require('../modules/diet/diet.routes');
const homeRoutes = require('../modules/home/home.routes');

// Mount module routes
router.use('/diet', dietRoutes);
router.use('/home', homeRoutes);

module.exports = router;
