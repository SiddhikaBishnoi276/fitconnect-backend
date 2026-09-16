// Plan controller: handles 7-day adaptive workout plan generation and updates
const planService = require('./plan.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * POST /plans/generate
 * Generates a new 7-day workout plan based on user profile and injuries
 */
const generatePlanHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const plan = await planService.generatePlan(userId);
    return sendSuccess(res, plan, 'Workout plan generated successfully', 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /plans/regenerate
 * Supersedes current plan and generates a fresh plan with updated settings
 */
const regeneratePlanHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const updatedSettings = req.body?.updatedSettings;
    const plan = await planService.regeneratePlan(userId, updatedSettings);
    return sendSuccess(res, plan, 'Workout plan regenerated successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /plans/current
 * Retrieves current active workout plan with daily completion metrics
 */
const getCurrentPlanHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query?.userId;
    const plan = await planService.getCurrentPlan(userId);
    return sendSuccess(res, plan, 'Current workout plan retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /plans/current/days/:dayIndex
 * Retrieves detailed exercise sequence and substitution info for specific day (1-7)
 */
const getCurrentPlanDayHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query?.userId;
    const { dayIndex } = req.params;
    const dayDetails = await planService.getCurrentPlanDay(userId, dayIndex);
    return sendSuccess(res, dayDetails, `Plan details for day ${dayIndex} retrieved successfully`);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  generatePlanHandler,
  regeneratePlanHandler,
  getCurrentPlanHandler,
  getCurrentPlanDayHandler,
};
