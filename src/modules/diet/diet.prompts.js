/**
 * Diet Prompts - Builds system and user prompts for AI diet plan generation and meal elaboration.
 */

/**
 * Builds the prompts for generating a full one-day diet plan.
 * @param {Object} params
 * @param {Object} params.user
 * @param {string} params.intensity
 * @param {boolean} params.hasSessionToday
 * @returns {{ system: string, user: string }}
 */
function buildDietPlanPrompt({ user = {}, intensity = 'none', hasSessionToday = false }) {
  const regionalCuisine = user.regional_cuisine || 'Indian';
  const weightKg = user.weight_kg ?? 'Unknown';
  const heightCm = user.height_cm ?? 'Unknown';
  const age = user.age ?? 'Unknown';
  const gender = user.gender ?? 'Unknown';
  const dietPreference = user.diet_preference || 'Standard / Non-restrictive';

  const system = 'You are a sports-nutrition assistant. Generate a realistic one-day diet plan for an athlete. Respond with JSON only — no prose, no markdown fences.';

  let sessionInstructions = '';
  if (hasSessionToday) {
    sessionInstructions = `The athlete has a scheduled workout session today with ${intensity} intensity.
You must include a pre_workout meal before the session and a post_workout meal after it, in addition to normal meals (4-5 meals total).`;
  } else {
    sessionInstructions = `The athlete does NOT have a workout session today (rest day / no session).
Provide a normal day structure: breakfast, lunch, dinner, and an optional snack (3-4 meals total).
Explicitly DO NOT use pre_workout or post_workout slots for today.`;
  }

  const userPrompt = `Athlete Profile:
- Weight: ${weightKg} kg
- Height: ${heightCm} cm
- Age: ${age}
- Gender: ${gender}
- Diet Preference: ${dietPreference}
- Regional Cuisine: ${regionalCuisine}
- Training Intensity: ${intensity}

Session Context:
${sessionInstructions}

Requirements:
Generate a personalized one-day diet plan matching the athlete's stats and cuisine preference.
Valid slot values: "breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout".

Provide the output strictly in the following JSON shape:
{
  "target_calories": <number>,
  "target_protein_g": <number>,
  "target_carbs_g": <number>,
  "target_fat_g": <number>,
  "meals": [
    {
      "slot": "breakfast" | "lunch" | "dinner" | "snack" | "pre_workout" | "post_workout",
      "name": "<dish name>",
      "cuisine": "<cuisine type>",
      "calories": <number>,
      "protein_g": <number>,
      "carbs_g": <number>,
      "fat_g": <number>,
      "ingredients": [
        {
          "name": "<ingredient name>",
          "grams": <number>
        }
      ],
      "prep_simplicity": "easy" | "medium" | "hard"
    }
  ]
}`;

  return {
    system,
    user: userPrompt
  };
}

/**
 * Builds the prompts for elaborating ingredients and prep simplicity for a known dish.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.cuisine
 * @param {number} params.calories
 * @param {number} params.protein_g
 * @param {number} params.carbs_g
 * @param {number} params.fat_g
 * @returns {{ system: string, user: string }}
 */
function buildMealElaborationPrompt({ name, cuisine, calories, protein_g, carbs_g, fat_g }) {
  const system = 'You reconstruct a plausible ingredient breakdown for an already-decided dish. You are given its name and exact macros — invent a realistic ingredient list (with grams) that would plausibly produce those macros. Respond with JSON only.';

  const userPrompt = `Dish Details:
- Name: ${name}
- Cuisine: ${cuisine}
- Calories: ${calories} kcal
- Protein: ${protein_g} g
- Carbs: ${carbs_g} g
- Fat: ${fat_g} g

Provide the output strictly in the following JSON shape:
{
  "ingredients": [
    {
      "name": "<ingredient name>",
      "grams": <number>
    }
  ],
  "prep_simplicity": "easy" | "medium" | "hard"
}`;

  return {
    system,
    user: userPrompt
  };
}

module.exports = {
  buildDietPlanPrompt,
  buildMealElaborationPrompt
};
