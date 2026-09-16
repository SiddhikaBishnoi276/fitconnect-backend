// Plan model: database queries for weekly plans and workout routines
const db = require('../../config/db');

/**
 * Fetch complete user profile context needed for AI plan generation
 * @param {string} userId 
 * @returns {Promise<object>}
 */
const getUserProfileForPlan = async (userId) => {
  const userRes = await db.query(
    `SELECT id, name, age, weight_kg, height_cm, gender, activity_level, 
            equipment, time_budget_minutes, preferred_days, goals 
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  const user = userRes.rows[0];

  const sportsRes = await db.query(
    `SELECT s.id, s.name, s.slug 
     FROM sports s 
     JOIN user_sports us ON s.id = us.sport_id 
     WHERE us.user_id = $1`,
    [userId]
  );

  const injuriesRes = await db.query(
    `SELECT id, body_part, condition, recovery_status, notes 
     FROM user_injuries 
     WHERE user_id = $1`,
    [userId]
  );

  return {
    ...user,
    workout_days_count: Array.isArray(user.preferred_days) && user.preferred_days.length > 0 ? user.preferred_days.length : 4,
    sports: sportsRes.rows,
    injuries: injuriesRes.rows,
  };
};

/**
 * Get all exercises catalog
 * @returns {Promise<Array>}
 */
const getAllExercises = async () => {
  const res = await db.query(
    `SELECT id, name, load_tags, contraindicated_body_parts, default_sets, default_reps_min, default_reps_max 
     FROM exercises`
  );
  return res.rows;
};

/**
 * Find existing exercise by name or create a new entry in exercises table
 * @param {string} exerciseName 
 * @param {object} [client] - Optional pg transaction client
 * @returns {Promise<string>} exercise UUID
 */
const findOrCreateExercise = async (exerciseName, client = null) => {
  const queryFn = client ? client.query.bind(client) : db.query;
  const nameTrimmed = (exerciseName || 'General Exercise').trim();

  const searchRes = await queryFn(
    `SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [nameTrimmed]
  );

  if (searchRes.rows.length > 0) {
    return searchRes.rows[0].id;
  }

  const insertRes = await queryFn(
    `INSERT INTO exercises (name, load_tags, contraindicated_body_parts) 
     VALUES ($1, '{}', '{}') 
     RETURNING id`,
    [nameTrimmed]
  );

  return insertRes.rows[0].id;
};

/**
 * Mark any currently active plans for user as superseded
 * @param {string} userId 
 * @param {object} [client] 
 */
const deactivateUserActivePlans = async (userId, client = null) => {
  const queryFn = client ? client.query.bind(client) : db.query;
  await queryFn(
    `UPDATE plans SET status = 'superseded' WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
};

/**
 * Helper to parse target reps range integers from string (e.g., "30m sprints", "10-12", "15")
 * @param {string|number} reps 
 * @returns {{ min: number|null, max: number|null }}
 */
const parseRepsRange = (reps) => {
  if (typeof reps === 'number') {
    return { min: reps, max: reps };
  }
  if (!reps || typeof reps !== 'string') {
    return { min: null, max: null };
  }

  const rangeMatch = reps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };
  }

  const singleMatch = reps.match(/(\d+)/);
  if (singleMatch) {
    const val = parseInt(singleMatch[1], 10);
    return { min: val, max: val };
  }

  return { min: null, max: null };
};

/**
 * Normalizes intensity string to DB ENUM ('low', 'medium', 'high')
 * @param {string} intensityStr 
 * @returns {string}
 */
const normalizeIntensity = (intensityStr) => {
  if (!intensityStr || typeof intensityStr !== 'string') return 'medium';
  const val = intensityStr.toLowerCase().trim();
  if (['low', 'medium', 'high'].includes(val)) {
    return val;
  }
  return 'medium';
};

/**
 * Persist full 7-day plan in database within a transaction
 * Handles UNIQUE(user_id, week_start_date) schema constraint seamlessly.
 * @param {string} userId 
 * @param {object} planJSON - Structured plan output from LLM / RuleEngine
 * @param {object} client - Active DB client with open transaction
 * @returns {Promise<object>} Created plan DB record
 */
const createPlanTransaction = async (userId, planJSON, client) => {
  // Calculate week start date (Current Monday date string)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon
  const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const weekStartDateStr = monday.toISOString().split('T')[0];

  // 1. Clear any existing plan record for the same week_start_date to respect UNIQUE(user_id, week_start_date)
  await client.query(
    `DELETE FROM plans WHERE user_id = $1 AND week_start_date = $2`,
    [userId, weekStartDateStr]
  );

  // 2. Mark any other active plans as superseded
  await deactivateUserActivePlans(userId, client);

  // 3. Insert into plans
  const planInsertRes = await client.query(
    `INSERT INTO plans (user_id, week_start_date, status, generation_context)
     VALUES ($1, $2, 'active', $3)
     RETURNING id, user_id, week_start_date, status, generation_context, created_at`,
    [userId, weekStartDateStr, JSON.stringify(planJSON)]
  );

  const planId = planInsertRes.rows[0].id;
  const daysInput = Array.isArray(planJSON.days) ? planJSON.days : [];

  // 4. Insert plan_days & plan_day_exercises
  for (let i = 0; i < daysInput.length; i++) {
    const day = daysInput[i];
    const dayIndex = day.day_index || (i + 1);
    const sessionType = day.title || day.type || `Day ${dayIndex} Training`;
    const durationMin = typeof day.estimated_duration_min === 'number' ? day.estimated_duration_min : 45;
    const intensity = normalizeIntensity(day.intensity);

    const dayInsertRes = await client.query(
      `INSERT INTO plan_days (plan_id, day_index, session_type, estimated_duration_min, intensity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [planId, dayIndex, sessionType, durationMin, intensity]
    );

    const planDayId = dayInsertRes.rows[0].id;
    const exercisesInput = Array.isArray(day.exercises) ? day.exercises : [];

    for (let j = 0; j < exercisesInput.length; j++) {
      const ex = exercisesInput[j];
      const exerciseId = await findOrCreateExercise(ex.exercise_name, client);
      const targetSets = typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets, 10) || 3;
      const { min: repsMin, max: repsMax } = parseRepsRange(ex.reps);
      const isSubstituted = Boolean(ex.is_injury_substituted);
      const subReason = ex.notes || null;

      await client.query(
        `INSERT INTO plan_day_exercises 
           (plan_day_id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, is_substituted, substitution_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [planDayId, exerciseId, j + 1, targetSets, repsMin, repsMax, isSubstituted, subReason]
      );
    }
  }

  return planInsertRes.rows[0];
};

/**
 * Fetch current active plan for user with day breakdown & exercise list
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
const getActivePlanWithDetails = async (userId) => {
  const planRes = await db.query(
    `SELECT id, user_id, week_start_date, status, generation_context, created_at 
     FROM plans 
     WHERE user_id = $1 AND status = 'active' 
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (planRes.rows.length === 0) {
    return null;
  }

  const plan = planRes.rows[0];
  const genContext = typeof plan.generation_context === 'string' 
    ? JSON.parse(plan.generation_context) 
    : (plan.generation_context || {});

  const daysRes = await db.query(
    `SELECT id, plan_id, day_index, sport_id, session_type, estimated_duration_min, intensity 
     FROM plan_days 
     WHERE plan_id = $1 
     ORDER BY day_index ASC`,
    [plan.id]
  );

  const planDays = daysRes.rows;
  const dayIds = planDays.map(d => d.id);

  // Fetch session completion statuses for these plan days
  let sessionMap = new Map();
  if (dayIds.length > 0) {
    const sessionRes = await db.query(
      `SELECT plan_day_id, status, fully_completed 
       FROM sessions 
       WHERE user_id = $1 AND plan_day_id = ANY($2)`,
      [userId, dayIds]
    );
    sessionRes.rows.forEach(s => {
      sessionMap.set(s.plan_day_id, s);
    });
  }

  // Day labels lookup
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const formattedDays = [];
  for (const dayRow of planDays) {
    const exRes = await db.query(
      `SELECT pde.id, pde.plan_day_id, pde.exercise_id, e.name AS exercise_name, 
              pde.order_index, pde.target_sets AS sets, 
              pde.target_reps_min, pde.target_reps_max, 
              pde.is_substituted AS is_injury_substituted, pde.substitution_reason AS notes
       FROM plan_day_exercises pde 
       JOIN exercises e ON pde.exercise_id = e.id 
       WHERE pde.plan_day_id = $1 
       ORDER BY pde.order_index ASC`,
      [dayRow.id]
    );

    const sessionInfo = sessionMap.get(dayRow.id);
    const isCompleted = sessionInfo ? (sessionInfo.status === 'completed' || sessionInfo.fully_completed) : false;

    const contextDay = Array.isArray(genContext.days) 
      ? genContext.days.find(d => d.day_index === dayRow.day_index) 
      : null;

    formattedDays.push({
      plan_day_id: dayRow.id,
      day_index: dayRow.day_index,
      day_label: contextDay?.day_label || dayLabels[(dayRow.day_index - 1) % 7],
      title: dayRow.session_type,
      type: contextDay?.type || (dayRow.session_type.toLowerCase().includes('rest') ? 'rest' : 'workout'),
      estimated_duration_min: dayRow.estimated_duration_min,
      intensity: dayRow.intensity ? (dayRow.intensity.charAt(0).toUpperCase() + dayRow.intensity.slice(1)) : 'Medium',
      is_rest_day: contextDay ? Boolean(contextDay.is_rest_day) : (dayRow.session_type.toLowerCase().includes('rest')),
      is_completed: isCompleted,
      exercises: exRes.rows.map(ex => {
        let repsStr = ex.target_reps_min ? `${ex.target_reps_min}` : 'Target';
        if (ex.target_reps_min && ex.target_reps_max && ex.target_reps_min !== ex.target_reps_max) {
          repsStr = `${ex.target_reps_min}-${ex.target_reps_max}`;
        }
        return {
          id: ex.id,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          sets: ex.sets || 3,
          reps: repsStr,
          notes: ex.notes || '',
          is_injury_substituted: Boolean(ex.is_injury_substituted),
        };
      }),
    });
  }

  return {
    plan_id: plan.id,
    user_id: plan.user_id,
    week_start_date: plan.week_start_date,
    status: plan.status,
    title: genContext.title || 'Athlete Dynamic Workout Plan',
    description: genContext.description || 'Weekly customized training focus',
    created_at: plan.created_at,
    days: formattedDays,
  };
};

/**
 * Get specific active plan day details by day index (1-7)
 * @param {string} userId 
 * @param {number} dayIndex 
 * @returns {Promise<object|null>}
 */
const getActivePlanDayDetails = async (userId, dayIndex) => {
  const activePlan = await getActivePlanWithDetails(userId);
  if (!activePlan || !Array.isArray(activePlan.days)) {
    return null;
  }

  const targetDay = activePlan.days.find(d => Number(d.day_index) === Number(dayIndex));
  return targetDay || null;
};

module.exports = {
  getUserProfileForPlan,
  getAllExercises,
  findOrCreateExercise,
  deactivateUserActivePlans,
  createPlanTransaction,
  getActivePlanWithDetails,
  getActivePlanDayDetails,
};
