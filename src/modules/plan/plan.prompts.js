// Plan prompts: specialized LLM prompts for multi-sport 7-day plans

const SYSTEM_PROMPT = `You are a professional athletic strength and conditioning coach AI. 
Generate a structured workout plan based on the user's weekly available workout days, sports activities, injuries, equipment, and goals.

Rules for Plan Generation:
1. Generate exact entries for 7 calendar days (Day 1 to Day 7 / Mon to Sun). 
2. If the user specifies 'N' workout days per week (e.g., 4 days), assign 'workout' type to N days and 'rest' or 'active_recovery' to the remaining days.
3. Balance fatigue according to the user's primary activities/sports.
4. If injuries exist, strictly flag and substitute prohibited movements.
5. You MUST return ONLY a raw JSON object matching this exact schema:

{
  "title": "String (e.g., Athlete Hybrid Strength & Speed Plan)",
  "description": "String (Short summary of the weekly focus)",
  "days": [
    {
      "day_index": 1,
      "day_label": "Mon",
      "title": "Sprint Intervals + Agility",
      "type": "workout",
      "estimated_duration_min": 55,
      "intensity": "High",
      "is_rest_day": false,
      "exercises": [
        {
          "exercise_name": "Shuttle Runs",
          "sets": 6,
          "reps": "30m sprints",
          "notes": "Focus on quick deceleration",
          "is_injury_substituted": false
        }
      ]
    }
  ]
}`;

/**
 * Builds the user context prompt string injected into the LLM pipeline
 * @param {object} profile
 * @returns {string} Prompt string combining system instructions and user profile
 */
const buildPlanPrompt = (profile = {}) => {
  const workoutDaysCount = profile.workout_days_count || (Array.isArray(profile.preferred_days) ? profile.preferred_days.length : 4);
  const preferredDays = Array.isArray(profile.preferred_days) && profile.preferred_days.length > 0
    ? profile.preferred_days.join(', ')
    : 'Mon, Wed, Fri, Sat';
  
  const sports = Array.isArray(profile.sports) && profile.sports.length > 0
    ? profile.sports.map(s => (typeof s === 'string' ? s : s.name || s.slug)).join(', ')
    : 'General Athletics';

  const injuries = Array.isArray(profile.injuries) && profile.injuries.length > 0
    ? profile.injuries.map(i => `${i.body_part || 'Unspecified'} (${i.condition || 'injury'}, status: ${i.recovery_status || 'ongoing'})`).join('; ')
    : 'None reported';

  const equipment = profile.equipment || 'gym';
  const goals = Array.isArray(profile.goals) ? profile.goals.join(', ') : (profile.goal || profile.goals || 'overall strength and athletic performance');
  const duration = profile.time_budget_minutes || 60;
  const activityLevel = profile.activity_level || 'intermediate';

  const userPrompt = `
User Profile & Constraints:
- Target Workout Days per Week: ${workoutDaysCount} days (Preferred days: ${preferredDays})
- Primary Sports/Activities: ${sports}
- Reported Injuries / Limitations: ${injuries}
- Available Equipment: ${equipment} (Options: 'gym' or 'home')
- Fitness Goals: ${goals}
- Activity Level: ${activityLevel}
- Session Duration Budget: ~${duration} minutes per workout session

Please generate a complete 7-day personalized workout plan following all system instructions and output strictly matching the raw JSON schema.
`;

  return `${SYSTEM_PROMPT}\n\n${userPrompt}`;
};

module.exports = {
  SYSTEM_PROMPT,
  buildPlanPrompt,
};
