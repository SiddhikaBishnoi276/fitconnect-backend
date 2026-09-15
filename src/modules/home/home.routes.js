/**
 * Home Routes - Defines endpoint for Home dashboard aggregator.
 */
const express = require('express');
const router = express.Router();
const homeController = require('./home.controller');
const authGuard = require('../../middleware/authGuard');

router.get('/', authGuard, homeController.getHome);
router.get('/home', authGuard, homeController.getHome);

module.exports = router;
