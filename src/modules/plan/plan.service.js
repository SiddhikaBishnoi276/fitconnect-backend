// Plan service: coordinates AI plan generation, rule-engine integration, and persistence
const db = require('../../config/db');
const llmClient = require('../../llm/llmClient');
const planModel = require('./plan.model');
const planPrompts = require('./plan.prompts');
const ruleEngine = require('../ruleEngine/ruleEngine.service');

/**
 * Fallback template generator when LLM key is missing or offline
 * @param {object} profile 
 * @returns {object}
 */
const generateFallbackPlan = (profile = {}) => {
  const sportsStr = Array.isArray(profile.sports) && profile.sports.length > 0 
    ? profile.sports.map(s => s.name || s.slug).join(' & ') 
    : 'Strength & Conditioning';

  const preferredDaysCount = profile.workout_days_count || 4;

  const days = [
    {
      day_index: 1,
      day_label: 'Mon',
      title: 'Upper Body Power & Core',
      type: preferredDaysCount >= 1 ? 'workout' : 'rest',
      estimated_duration_min: profile.time_budget_minutes || 50,
      intensity: 'High',
      is_rest_day: preferredDaysCount < 1,
      exercises: [
        { exercise_name: 'Bench Press', sets: 4, reps: '8-10', notes: 'Maintain strict control on tempo', is_injury_substituted: false },
        { exercise_name: 'Plank Hold', sets: 3, reps: '60s hold', notes: 'Engage core stability', is_injury_substituted: false }
      ]
    },
    {
      day_index: 2,
      day_label: 'Tue',
      title: 'Lower Body Strength',
      type: preferredDaysCount >= 2 ? 'workout' : 'rest',
      estimated_duration_min: profile.time_budget_minutes || 55,
      intensity: 'High',
      is_rest_day: preferredDaysCount < 2,
      exercises: [
        { exercise_name: 'Barbell Back Squat', sets: 4, reps: '8-10', notes: 'Focus on full depth', is_injury_substituted: false }
      ]
    },
    {
      day_index: 3,
      day_label: 'Wed',
      title: 'Active Mobility & Recovery',
      type: 'active_recovery',
      estimated_duration_min: 30,
      intensity: 'Low',
      is_rest_day: true,
      exercises: []
    },
    {
      day_index: 4,
      day_label: 'Thu',
      title: 'Agility & Interval Cardio',
      type: preferredDaysCount >= 3 ? 'workout' : 'rest',
      estimated_duration_min: profile.time_budget_minutes || 45,
      intensity: 'High',
      is_rest_day: preferredDaysCount < 3,
      exercises: [
        { exercise_name: 'Sprint Intervals', sets: 5, reps: '50m sprints', notes: 'Explosive acceleration', is_injury_substituted: false }
      ]
    },
    {
      day_index: 5,
      day_label: 'Fri',
      title: 'Full Body Athletic Conditioning',
      type: preferredDaysCount >= 4 ? 'workout' : 'rest',
      estimated_duration_min: profile.time_budget_minutes || 50,
      intensity: 'Medium',
      is_rest_day: preferredDaysCount < 4,
      exercises: [
        { exercise_name: 'Football Agility Cones', sets: 4, reps: '5 rounds', notes: 'Quick directional change', is_injury_substituted: false }
      ]
    },
    {
      day_index: 6,
      day_label: 'Sat',
      title: 'Light Dynamic Sport Drills',
      type: preferredDaysCount >= 5 ? 'workout' : 'active_recovery',
      estimated_duration_min: 40,
      intensity: 'Medium',
      is_rest_day: preferredDaysCount < 5,
      exercises: []
    },
    {
      day_index: 7,
      day_label: 'Sun',
      title: 'Full Rest & Recovery',
      type: 'rest',
      estimated_duration_min: 0,
      intensity: 'Low',
      is_rest_day: true,
      exercises: []
    }
  ];

  return {
    title: `Athlete ${sportsStr} Performance Plan`,
    description: `Personalized 7-day training plan optimized for ${sportsStr} and ${profile.equipment || 'gym'} equipment.`,
    days,
  };
};

/**
 * Generate a new 7-day adaptive workout plan using LLM + ruleEngine
 * @param {string} userId 
 * @returns {Promise<object>}
 */
const generatePlan = async (userId) => {
  // a. Fetch user profile from DB
  const profile = await planModel.getUserProfileForPlan(userId);
  const catalog = await planModel.getAllExercises();

  // b. Trigger ruleEngine + LLM prompt pipeline
  const prompt = planPrompts.buildPlanPrompt(profile);
  let rawPlanJSON;

  if (llmClient.isGeminiConfigured()) {
    try {
      rawPlanJSON = await llmClient.generateJSON(prompt);
    } catch (llmErr) {
      console.warn('⚠️ [LLM Generation Fallback]: Gemini call failed, using ruleEngine fallback plan:', llmErr.message);
      rawPlanJSON = generateFallbackPlan(profile);
    }
  } else {
    console.warn('⚠️ [LLM Config Warning]: GEMINI_API_KEY not set. Using ruleEngine fallback plan for generation.');
    rawPlanJSON = generateFallbackPlan(profile);
  }

  // Enforce array structure safety
  if (!rawPlanJSON || typeof rawPlanJSON !== 'object') {
    rawPlanJSON = generateFallbackPlan(profile);
  }
  if (!Array.isArray(rawPlanJSON.days) || rawPlanJSON.days.length === 0) {
    rawPlanJSON.days = generateFallbackPlan(profile).days;
  }

  // c. Verify and substitute injuries using RuleEngine
  const validatedPlanJSON = ruleEngine.validateAndSubstituteInjuries(rawPlanJSON, profile.injuries, catalog);

  // d. In a single DB Transaction, deactivate previous active plan & insert new plan, days, exercises
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await planModel.createPlanTransaction(userId, validatedPlanJSON, client);
    await client.query('COMMIT');
  } catch (txError) {
    await client.query('ROLLBACK');
    console.error('❌ [createPlanTransaction Failed]:', txError.message);
    throw txError;
  } finally {
    client.release();
  }

  // e. Return structured response matching GET /plans/current format
  const currentPlan = await planModel.getActivePlanWithDetails(userId);
  return currentPlan;
};

/**
 * Regenerate current active plan with optional updated settings
 * @param {string} userId 
 * @param {object} [updatedSettings] 
 * @returns {Promise<object>}
 */
const regeneratePlan = async (userId, updatedSettings = null) => {
  if (updatedSettings && typeof updatedSettings === 'object') {
    // If updated settings were provided, fetch existing profile and merge in memory
    const existingProfile = await planModel.getUserProfileForPlan(userId);
    const mergedProfile = { ...existingProfile, ...updatedSettings };

    const catalog = await planModel.getAllExercises();
    const prompt = planPrompts.buildPlanPrompt(mergedProfile);

    let rawPlanJSON;
    if (llmClient.isGeminiConfigured()) {
      try {
        rawPlanJSON = await llmClient.generateJSON(prompt);
      } catch (llmErr) {
        console.warn('⚠️ [LLM Regeneration Fallback]: Gemini call failed, using ruleEngine fallback:', llmErr.message);
        rawPlanJSON = generateFallbackPlan(mergedProfile);
      }
    } else {
      rawPlanJSON = generateFallbackPlan(mergedProfile);
    }

    const validatedPlanJSON = ruleEngine.validateAndSubstituteInjuries(rawPlanJSON, mergedProfile.injuries, catalog);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await planModel.createPlanTransaction(userId, validatedPlanJSON, client);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return await planModel.getActivePlanWithDetails(userId);
  }

  // Default regeneration: re-runs generatePlan with current profile/injuries
  return await generatePlan(userId);
};

/**
 * Get user's current active plan with completion indicators
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
const getCurrentPlan = async (userId) => {
  let activePlan = await planModel.getActivePlanWithDetails(userId);

  // If no plan exists for user yet, auto-generate one!
  if (!activePlan) {
    activePlan = await generatePlan(userId);
  }

  return activePlan;
};

/**
 * Get detailed day info for dayIndex (1-7)
 * @param {string} userId 
 * @param {number} dayIndex 
 * @returns {Promise<object>}
 */
const getCurrentPlanDay = async (userId, dayIndex) => {
  const numericIndex = parseInt(dayIndex, 10);
  if (isNaN(numericIndex) || numericIndex < 1 || numericIndex > 7) {
    const error = new Error('Invalid dayIndex parameter. Must be an integer between 1 and 7.');
    error.statusCode = 400;
    error.code = 'INVALID_PARAM';
    throw error;
  }

  // Ensure an active plan exists
  let activePlan = await planModel.getActivePlanWithDetails(userId);
  if (!activePlan) {
    activePlan = await generatePlan(userId);
  }

  const dayDetails = await planModel.getActivePlanDayDetails(userId, numericIndex);
  if (!dayDetails) {
    const error = new Error(`Day ${numericIndex} details not found in active workout plan.`);
    error.statusCode = 444;
    error.code = 'NOT_FOUND';
    throw error;
  }

  return dayDetails;
};

module.exports = {
  generatePlan,
  regeneratePlan,
  getCurrentPlan,
  getCurrentPlanDay,
};
