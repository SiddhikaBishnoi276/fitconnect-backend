/**
 * Diet Controller - Handles HTTP requests for diet generation, current plan, meal detail, and macro history.
 */
const dietService = require('./diet.service');
const { sendSuccess, sendError } = require('../../utils/responseFormatter');

/**
 * Generate a new diet plan for the authenticated user.
 */
async function generate(req, res, next) {
  try {
    const plan = await dietService.generateDietPlan(req.user.id);
    return sendSuccess(res, plan);
  } catch (err) {
    if (err.message === 'DIET_GENERATION_FAILED') {
      return sendError(
        res,
        'DIET_GENERATION_FAILED',
        "Couldn't generate your diet plan right now — please try again.",
        502
      );
    }
    next(err);
  }
}

/**
 * Retrieve today's diet plan for the authenticated user.
 */
async function getToday(req, res, next) {
  try {
    const plan = await dietService.getTodayPlan(req.user.id);
    return sendSuccess(res, plan);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve detailed meal info including AI ingredient elaboration.
 */
async function getMeal(req, res, next) {
  try {
    const meal = await dietService.getMealDetail(req.params.mealId);
    if (!meal) {
      return sendError(res, 'NOT_FOUND', 'Meal not found', 404);
    }
    return sendSuccess(res, meal);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve macro target history for the authenticated user.
 */
async function getHistory(req, res, next) {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const history = await dietService.getMacroHistory(req.user.id, days);
    return sendSuccess(res, history);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generate,
  getToday,
  getMeal,
  getHistory
};
