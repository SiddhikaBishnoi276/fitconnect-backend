// Session model: raw database queries for workout sessions, feedback logs, PRs, and RP ledger
const db = require('../../config/db');

/**
 * Get plan_day details by ID, verifying it belongs to an active plan for the user
 * @param {string} planDayId 
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
const getPlanDayById = async (planDayId, userId) => {
  const res = await db.query(
    `SELECT pd.id, pd.plan_id, pd.day_index, pd.sport_id, pd.session_type, pd.estimated_duration_min, pd.intensity
     FROM plan_days pd
     JOIN plans p ON pd.plan_id = p.id
     WHERE pd.id = $1 AND p.user_id = $2 AND p.status = 'active'`,
    [planDayId, userId]
  );
  return res.rows[0] || null;
};

/**
 * Find active in_progress session for user
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
const findActiveSessionByUserId = async (userId) => {
  const res = await db.query(
    `SELECT id, user_id, plan_day_id, date, status, sleep_quality, soreness, energy,
            new_discomfort_present, new_discomfort_body_part, created_at
     FROM sessions
     WHERE user_id = $1 AND status = 'in_progress'
     LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
};

/**
 * Get session by ID
 * @param {string} sessionId 
 * @returns {Promise<object|null>}
 */
const getSessionById = async (sessionId) => {
  const res = await db.query(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId]
  );
  return res.rows[0] || null;
};

/**
 * Create a new workout session record
 * @param {object} sessionData 
 * @returns {Promise<object>}
 */
const createSession = async ({
  userId,
  planDayId,
  sleepQuality,
  soreness,
  energy,
  newDiscomfortPresent,
  newDiscomfortBodyPart
}) => {
  const res = await db.query(
    `INSERT INTO sessions (
       user_id, plan_day_id, date, status,
       sleep_quality, soreness, energy,
       new_discomfort_present, new_discomfort_body_part
     )
     VALUES ($1, $2, CURRENT_DATE, 'in_progress', $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      planDayId,
      sleepQuality,
      soreness,
      energy,
      Boolean(newDiscomfortPresent),
      newDiscomfortBodyPart || null
    ]
  );
  return res.rows[0];
};

/**
 * Get canonical exercises for a plan_day
 * @param {string} planDayId 
 * @returns {Promise<Array>}
 */
const getPlanDayExercises = async (planDayId) => {
  const res = await db.query(
    `SELECT pde.id, pde.plan_day_id, pde.exercise_id, e.name AS exercise_name,
            pde.order_index, pde.target_sets, pde.target_reps_min, pde.target_reps_max,
            pde.is_substituted, pde.substitution_reason
     FROM plan_day_exercises pde
     JOIN exercises e ON pde.exercise_id = e.id
     WHERE pde.plan_day_id = $1
     ORDER BY pde.order_index ASC`,
    [planDayId]
  );
  return res.rows;
};

/**
 * Get feedback rows for a session
 * @param {string} sessionId 
 * @returns {Promise<Array>}
 */
const getSessionFeedbackRows = async (sessionId) => {
  const res = await db.query(
    `SELECT id, session_id, exercise_id, order_index, target_reps_min, target_reps_max,
            actual_reps, actual_weight_kg, feedback, adaptation_applied
     FROM session_exercise_feedback
     WHERE session_id = $1
     ORDER BY order_index ASC`,
    [sessionId]
  );
  return res.rows;
};

/**
 * Find matching plan_day_exercises row by planDayId, exerciseId, orderIndex
 * @param {string} planDayId 
 * @param {string} exerciseId 
 * @param {number} orderIndex 
 * @returns {Promise<object|null>}
 */
const findPlanDayExercise = async (planDayId, exerciseId, orderIndex) => {
  const res = await db.query(
    `SELECT pde.*, e.name AS exercise_name
     FROM plan_day_exercises pde
     JOIN exercises e ON pde.exercise_id = e.id
     WHERE pde.plan_day_id = $1 AND pde.exercise_id = $2 AND pde.order_index = $3
     LIMIT 1`,
    [planDayId, exerciseId, orderIndex]
  );
  return res.rows[0] || null;
};

/**
 * Insert a session_exercise_feedback record
 * @param {object} feedbackData 
 * @returns {Promise<object>}
 */
const insertSessionExerciseFeedback = async ({
  sessionId,
  exerciseId,
  orderIndex,
  targetRepsMin,
  targetRepsMax,
  actualReps,
  actualWeightKg,
  feedback,
  adaptationApplied
}) => {
  const res = await db.query(
    `INSERT INTO session_exercise_feedback (
       session_id, exercise_id, order_index,
       target_reps_min, target_reps_max,
       actual_reps, actual_weight_kg,
       feedback, adaptation_applied
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      sessionId,
      exerciseId,
      orderIndex,
      targetRepsMin,
      targetRepsMax,
      actualReps,
      actualWeightKg,
      feedback,
      adaptationApplied
    ]
  );
  return res.rows[0];
};

/**
 * Mark session as completed and save summary statistics
 * @param {string} sessionId 
 * @param {object} stats 
 * @returns {Promise<object>}
 */
const updateSessionComplete = async (sessionId, {
  durationMin,
  exercisesCompleted,
  adaptedCount,
  skippedCount,
  fullyCompleted
}) => {
  const res = await db.query(
    `UPDATE sessions
     SET status = 'completed',
         duration_min = $1,
         exercises_completed = $2,
         adapted_count = $3,
         skipped_count = $4,
         fully_completed = $5,
         completed_at = now()
     WHERE id = $6
     RETURNING *`,
    [durationMin, exercisesCompleted, adaptedCount, skippedCount, fullyCompleted, sessionId]
  );
  return res.rows[0];
};

/**
 * Look up MAX(value) from prs table for a user, exercise, and metric
 * @param {string} userId 
 * @param {string} exerciseId 
 * @param {string} metric 
 * @returns {Promise<number|null>}
 */
const getPersonalRecord = async (userId, exerciseId, metric) => {
  const res = await db.query(
    `SELECT MAX(value) AS max_val FROM prs
     WHERE user_id = $1 AND exercise_id = $2 AND metric = $3`,
    [userId, exerciseId, metric]
  );
  return res.rows[0]?.max_val !== null && res.rows[0]?.max_val !== undefined ? Number(res.rows[0].max_val) : null;
};

/**
 * Insert new PR record
 * @param {object} prData 
 * @returns {Promise<object>}
 */
const insertPersonalRecord = async ({
  userId,
  exerciseId,
  metric,
  value,
  previousBest,
  sessionId
}) => {
  const res = await db.query(
    `INSERT INTO prs (
       user_id, exercise_id, metric, value,
       previous_best, session_id, genuine_votes, flag_votes, verification_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'unverified')
     RETURNING *`,
    [userId, exerciseId, metric, value, previousBest, sessionId]
  );
  return res.rows[0];
};

/**
 * Insert into rp_ledger table (trigger apply_rp_ledger will auto-update users.rp_total)
 * @param {object} ledgerData 
 * @returns {Promise<object>}
 */
const insertRpLedger = async ({ userId, sessionId, type, points, reason }) => {
  const res = await db.query(
    `INSERT INTO rp_ledger (user_id, session_id, type, points, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, sessionId || null, type, points, reason]
  );
  return res.rows[0];
};

/**
 * Get date of user's most recent prior fully completed session
 * @param {string} userId 
 * @param {string} currentSessionId 
 * @returns {Promise<string|null>} YYYY-MM-DD string or null
 */
const getLastCompletedSessionDate = async (userId, currentSessionId) => {
  const res = await db.query(
    `SELECT date FROM sessions
     WHERE user_id = $1 AND status = 'completed' AND fully_completed = true AND id <> $2
     ORDER BY date DESC, completed_at DESC
     LIMIT 1`,
    [userId, currentSessionId]
  );
  if (!res.rows[0]?.date) return null;
  const d = new Date(res.rows[0].date);
  return d.toISOString().split('T')[0];
};

/**
 * Get user streak and RP info
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
const getUserById = async (userId) => {
  const res = await db.query(
    `SELECT id, current_streak, longest_streak, rp_total FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0] || null;
};

/**
 * Update user current_streak and longest_streak
 * @param {string} userId 
 * @param {number} currentStreak 
 * @param {number} longestStreak 
 * @returns {Promise<object>}
 */
const updateUserStreaks = async (userId, currentStreak, longestStreak) => {
  const res = await db.query(
    `UPDATE users
     SET current_streak = $1, longest_streak = $2, updated_at = now()
     WHERE id = $3
     RETURNING current_streak, longest_streak`,
    [currentStreak, longestStreak, userId]
  );
  return res.rows[0];
};

/**
 * Delete a session row completely (cascade deletes feedback rows)
 * @param {string} sessionId 
 * @returns {Promise<void>}
 */
const deleteSession = async (sessionId) => {
  await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
};

module.exports = {
  getPlanDayById,
  findActiveSessionByUserId,
  getSessionById,
  createSession,
  getPlanDayExercises,
  getSessionFeedbackRows,
  findPlanDayExercise,
  insertSessionExerciseFeedback,
  updateSessionComplete,
  getPersonalRecord,
  insertPersonalRecord,
  insertRpLedger,
  getLastCompletedSessionDate,
  getUserById,
  updateUserStreaks,
  deleteSession,
};
