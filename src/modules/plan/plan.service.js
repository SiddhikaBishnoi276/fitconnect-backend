// Plan service: coordinates AI plan generation, rule-engine integration, and persistence
const db = require('../../config/db');
const llmClient = require('../../llm/llmClient');
const planModel = require('./plan.model');
const planPrompts = require('./plan.prompts');
const ruleEngine = require('../ruleEngine/ruleEngine.service');

// Fallback plan removed

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
      console.log('🔄 [LLM]: Sending prompt to Gemini API to generate plan...');
      const res = await llmClient.generate(null, prompt, { expectJSON: true, timeoutMs: 60000 });
      rawPlanJSON = res.json;
      console.log('✅ [LLM SUCCESS]: Plan successfully generated via Gemini API (No hardcoding)!');
    } catch (llmErr) {
      console.error('❌ [LLM ERROR]: Gemini API failed to generate plan:', llmErr.message);
      throw llmErr;
    }
  } else {
    console.error('❌ [LLM Config Error]: GEMINI_API_KEY not set.');
    throw new Error('GEMINI_API_KEY not set. Cannot generate plan.');
  }

  // Enforce array structure safety
  if (!rawPlanJSON || typeof rawPlanJSON !== 'object') {
    throw new Error('LLM returned invalid JSON structure (not an object).');
  }
  if (!Array.isArray(rawPlanJSON.days) || rawPlanJSON.days.length === 0) {
    throw new Error('LLM returned invalid JSON structure (no days array).');
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
        const res = await llmClient.generate(null, prompt, { expectJSON: true, timeoutMs: 60000 });
        rawPlanJSON = res.json;
      } catch (llmErr) {
        console.error('❌ [LLM Regeneration Error]: Gemini call failed:', llmErr.message);
        throw llmErr;
      }
    } else {
      console.error('❌ [LLM Config Error]: GEMINI_API_KEY not set.');
      throw new Error('GEMINI_API_KEY not set. Cannot regenerate plan.');
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
  const activePlan = await planModel.getActivePlanWithDetails(userId);
  return activePlan || null; // Return null so frontend can show "Generate My 7-Day Plan" button
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
    const error = new Error('No active workout plan found for user.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
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
