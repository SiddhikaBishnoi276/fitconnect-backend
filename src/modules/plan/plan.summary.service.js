const db = require('../../config/db');
const llmClient = require('../../llm/llmClient');
const planModel = require('./plan.model');

/**
 * Gather raw data for the week, prompt LLM to summarize, and save to ai_weekly_summaries
 * @param {string} userId 
 * @param {string} planId 
 */
const generateWeeklySummary = async (userId, planId) => {
  try {
    console.log(`[AI-Summary] Starting generation for User: ${userId} | Plan: ${planId}`);
    
    // 1. Fetch Plan Details (week_start_date, etc.)
    const planRes = await db.query(
      `SELECT week_start_date FROM plans WHERE id = $1 AND user_id = $2`, 
      [planId, userId]
    );
    
    if (planRes.rows.length === 0) {
      console.warn(`[AI-Summary] Plan not found`);
      return;
    }
    
    const weekStartDate = planRes.rows[0].week_start_date;
    const weekEndDate = new Date(new Date(weekStartDate).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 2. Gather raw sessions data and feedback
    const dataRes = await db.query(`
      SELECT 
        s.date,
        s.status,
        s.fully_completed,
        s.exercises_completed,
        s.skipped_count,
        s.soreness,
        s.energy,
        json_agg(
          json_build_object(
            'exercise_id', sef.exercise_id,
            'target_reps_min', sef.target_reps_min,
            'actual_reps', sef.actual_reps,
            'actual_weight_kg', sef.actual_weight_kg,
            'feedback', sef.feedback
          )
        ) as feedback
      FROM sessions s
      LEFT JOIN session_exercise_feedback sef ON sef.session_id = s.id
      WHERE s.user_id = $1 AND s.plan_day_id IN (
        SELECT id FROM plan_days WHERE plan_id = $2
      )
      GROUP BY s.id
      ORDER BY s.date ASC
    `, [userId, planId]);

    const sessionsRaw = dataRes.rows;

    // 3. Compile prompt
    const systemPrompt = `You are FitConnect's AI coach. Analyze the user's weekly workout log and provide a concise summary.
You MUST respond with a strictly formatted JSON object following this schema:
{
  "consistency_score": (Number 0-100),
  "struggles": (Array of strings, e.g., ["Bench press too hard", "Missed a session"]),
  "achievements": (Array of strings, e.g., ["Hit deadlift target"]),
  "recommendations_for_next_week": (String, brief coaching advice)
}`;
    
    const userPrompt = `Weekly Raw Data:
${JSON.stringify(sessionsRaw, null, 2)}

Provide the JSON summary.`;

    // 4. Generate JSON via LLM
    const { json: summaryJson } = await llmClient.generate(systemPrompt, userPrompt, { expectJSON: true });

    if (!summaryJson) {
      throw new Error('LLM returned empty JSON');
    }

    // 5. Save to database
    await db.query(`
      INSERT INTO ai_weekly_summaries (user_id, plan_id, week_start_date, week_end_date, summary_json)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, week_start_date) 
      DO UPDATE SET summary_json = EXCLUDED.summary_json, week_end_date = EXCLUDED.week_end_date, plan_id = EXCLUDED.plan_id
    `, [userId, planId, weekStartDate, weekEndDate, JSON.stringify(summaryJson)]);

    console.log(`[AI-Summary] Successfully saved summary for Plan: ${planId}`);
    return summaryJson;
  } catch (error) {
    console.error(`[AI-Summary] Failed to generate summary:`, error);
  }
};

module.exports = {
  generateWeeklySummary
};
