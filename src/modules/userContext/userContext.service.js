/**
 * UserContext Service - Compiles unified per-user state and home dashboard data.
 */
const dietService = require('../diet/diet.service');

/**
 * Compiles composite home dashboard context including nutrition mini-card data.
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
async function getUserHomeContext(userId) {
  // Retrieve today's nutrition plan via the diet service
  const nutrition = await dietService.getTodayPlan(userId);

  return {
    user_id: userId,
    nutrition, // Home nutrition mini-card data
    plan: null,
    progress: null,
    notifications: []
  };
}

module.exports = {
  getUserHomeContext
};
