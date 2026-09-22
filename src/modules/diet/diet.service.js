/**
 * Diet Service - Contains all business logic for diet generation, retrieval, and elaboration.
 */
const dietModel = require('./diet.model');
const { buildDietPlanPrompt, buildMealElaborationPrompt } = require('./diet.prompts');
const { getInsightLine, getHydrationTip } = require('./diet.insights');
const llmClient = require('../../llm/llmClient');

const VALID_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];
const VALID_PREP = ['easy', 'medium', 'hard'];

/**
 * Validates the structure and data types of an AI-generated diet plan.
 * @param {any} json
 * @returns {boolean}
 */
function validatePlan(json) {
  if (!json || typeof json !== 'object') return false;

  const { target_calories, target_protein_g, target_carbs_g, target_fat_g, meals } = json;

  if (
    typeof target_calories !== 'number' || isNaN(target_calories) ||
    typeof target_protein_g !== 'number' || isNaN(target_protein_g) ||
    typeof target_carbs_g !== 'number' || isNaN(target_carbs_g) ||
    typeof target_fat_g !== 'number' || isNaN(target_fat_g)
  ) {
    return false;
  }

  if (!Array.isArray(meals) || meals.length < 3 || meals.length > 6) {
    return false;
  }

  for (const meal of meals) {
    if (!meal || typeof meal !== 'object') return false;
    if (!VALID_SLOTS.includes(meal.slot)) return false;
    if (typeof meal.name !== 'string' || meal.name.trim().length === 0) return false;
    if (
      typeof meal.calories !== 'number' || isNaN(meal.calories) ||
      typeof meal.protein_g !== 'number' || isNaN(meal.protein_g) ||
      typeof meal.carbs_g !== 'number' || isNaN(meal.carbs_g) ||
      typeof meal.fat_g !== 'number' || isNaN(meal.fat_g)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validates the structure of a meal elaboration AI response.
 * @param {any} json
 * @returns {boolean}
 */
function validateElaboration(json) {
  if (!json || typeof json !== 'object') return false;

  const { ingredients, prep_simplicity } = json;

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return false;
  }

  for (const item of ingredients) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.name !== 'string' || item.name.trim().length === 0) return false;
    if (typeof item.grams !== 'number' || isNaN(item.grams)) return false;
  }

  if (!VALID_PREP.includes(prep_simplicity)) {
    return false;
  }

  return true;
}

/**
 * Generates and saves a personalized one-day diet plan for the user.
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
async function generateDietPlan(userId) {
  const user = await dietModel.getUserProfile(userId);
  const plannedTraining = await dietModel.getTodaysPlannedTraining(userId);

  const intensity = plannedTraining?.intensity || 'none';
  const hasSessionToday = Boolean(plannedTraining?.hasSessionToday);

  const { system, user: userPrompt } = buildDietPlanPrompt({
    user,
    intensity,
    hasSessionToday
  });

  let aiResponse = null;

  // Attempt 1
  try {
    const res = await llmClient.generate(system, userPrompt, {
      expectJSON: true,
      timeoutMs: 25000
    });
    if (validatePlan(res?.json)) {
      aiResponse = res.json;
    }
  } catch (err) {
    // Retry once below
  }

  // Attempt 2 (retry if first failed or invalid)
  if (!aiResponse) {
    try {
      const retryRes = await llmClient.generate(system, userPrompt, {
        expectJSON: true,
        timeoutMs: 25000
      });
      if (validatePlan(retryRes?.json)) {
        aiResponse = retryRes.json;
      }
    } catch (err) {
      // Handled by validation check below
    }
  }

  if (!aiResponse) {
    throw new Error('DIET_GENERATION_FAILED');
  }

  const targets = {
    target_calories: aiResponse.target_calories,
    target_protein_g: aiResponse.target_protein_g,
    target_carbs_g: aiResponse.target_carbs_g,
    target_fat_g: aiResponse.target_fat_g
  };

  const sessionId = await dietModel.getExistingSessionIdForToday(userId);
  const savedPlan = await dietModel.saveDietPlan(userId, targets, aiResponse.meals, sessionId);

  // Merge ingredients and prep_simplicity back to saved meals by array index
  const enrichedMeals = savedPlan.meals.map((savedMeal, index) => {
    const aiMeal = aiResponse.meals[index] || {};
    return {
      ...savedMeal,
      ingredients: aiMeal.ingredients || null,
      prep_simplicity: aiMeal.prep_simplicity || null
    };
  });

  return {
    ...savedPlan,
    meals: enrichedMeals,
    insight: getInsightLine(intensity),
    hydration: getHydrationTip(intensity)
  };
}

/**
 * Retrieves today's diet plan and merges dynamic training insight and hydration.
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
async function getTodayPlan(userId) {
  const today = new Date().toISOString().split('T')[0];
  const plan = await dietModel.getDietPlanForDate(userId, today);

  if (!plan) {
    return { has_plan: false };
  }

  const plannedTraining = await dietModel.getTodaysPlannedTraining(userId);
  const intensity = plannedTraining?.intensity || 'none';

  return {
    has_plan: true,
    ...plan,
    insight: getInsightLine(intensity),
    hydration: getHydrationTip(intensity)
  };
}

/**
 * Retrieves a single meal and elaborates its ingredients and preparation simplicity.
 * @param {string|number} mealId
 * @returns {Promise<Object|null>}
 */
async function getMealDetail(mealId) {
  const meal = await dietModel.getMealById(mealId);
  if (!meal) {
    return null;
  }

  const { system, user } = buildMealElaborationPrompt(meal);

  try {
    const result = await llmClient.generate(system, user, {
      expectJSON: true,
      timeoutMs: 60000
    });

    if (result?.json && validateElaboration(result.json)) {
      return {
        ...meal,
        ingredients: result.json.ingredients,
        prep_simplicity: result.json.prep_simplicity
      };
    }
  } catch (error) {
    // Graceful fallback on LLM failure or timeout
  }

  return {
    ...meal,
    ingredients: null,
    prep_simplicity: null
  };
}

/**
 * Retrieves macro targets history over a range of days.
 * @param {string|number} userId
 * @param {number} days
 * @returns {Promise<Array<Object>>}
 */
async function getMacroHistory(userId, days) {
  return await dietModel.getDietLogsRange(userId, days);
}

module.exports = {
  VALID_SLOTS,
  VALID_PREP,
  validatePlan,
  validateElaboration,
  generateDietPlan,
  getTodayPlan,
  getMealDetail,
  getMacroHistory
};
