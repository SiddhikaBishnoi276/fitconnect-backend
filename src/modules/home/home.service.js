/**
 * Home Service - Aggregates plan, progress, notifications, and nutrition for the home dashboard.
 */
const dietService = require('../diet/diet.service');

/**
 * Retrieves aggregated dashboard data for the home screen.
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
async function getHomeDashboard(userId) {
  // Call dietService.getTodayPlan(userId) without duplicating logic
  const nutrition = await dietService.getTodayPlan(userId);

  return {
    plan: null,
    progress: null,
    notifications: [],
    nutrition // Supplies data for the Home nutrition mini-card
  };
}

module.exports = {
  getHomeDashboard
};
