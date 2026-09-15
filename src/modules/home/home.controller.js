/**
 * Home Controller - Handles requests for the Home dashboard aggregator.
 */
const homeService = require('./home.service');
const { sendSuccess } = require('../../utils/responseFormatter');

async function getHome(req, res, next) {
  try {
    const dashboardData = await homeService.getHomeDashboard(req.user.id);
    return sendSuccess(res, dashboardData);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHome
};
