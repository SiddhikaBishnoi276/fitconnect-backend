// Master router combining all module routes with /api/v1 prefix
const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');

const router = express.Router();

// Register auth module routes
router.use('/auth', authRoutes);

module.exports = router;
