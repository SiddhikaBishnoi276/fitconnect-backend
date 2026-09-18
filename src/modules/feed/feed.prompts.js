/**
 * Feed Prompts - LLM prompts for generating social feed workout captions.
 */

/**
 * Builds system and user prompt for drafting a casual workout post caption.
 * @param {object} sessionDetails
 * @param {string} [sessionDetails.sportName]
 * @param {string} [sessionDetails.sessionType]
 * @param {number|string} [sessionDetails.durationMinutes]
 * @param {string} [sessionDetails.intensity]
 * @param {number|string} [sessionDetails.exercisesCompleted]
 * @param {number|string} [sessionDetails.totalExercises]
 * @returns {{ system: string, user: string }}
 */
function buildDraftCaptionPrompt({
  sportName = 'General Fitness',
  sessionType = 'workout',
  durationMinutes = 45,
  intensity = 'moderate',
  exercisesCompleted = 0,
  totalExercises = 0,
} = {}) {
  const system =
    'You write short, upbeat, casual social-media captions for a fitness app. Keep it under 25 words. Use at most one emoji. Respond with plain text only — no quotes, no markdown, no explanation, just the caption itself.';

  const user = `Workout details:
- Sport: ${sportName}
- Session Type: ${sessionType}
- Duration: ${durationMinutes} minutes
- Intensity: ${intensity}
- Exercises Completed: ${exercisesCompleted} of ${totalExercises} assigned

Write a short, upbeat caption celebrating this workout.`;

  return { system, user };
}

module.exports = {
  buildDraftCaptionPrompt,
};
