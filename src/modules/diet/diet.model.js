/**
 * Diet Model - Raw PostgreSQL database queries for the diet module.
 */
const db = require('../../config/db');

/**
 * Retrieves the user's physical stats and diet preferences.
 * @param {string|number} userId
 * @returns {Promise<Object|null>}
 */
async function getUserProfile(userId) {
  const text = `
    SELECT weight_kg, height_cm, age, gender, diet_preference, regional_cuisine
    FROM users
    WHERE id = $1
  `;
  const result = await db.query(text, [userId]);
  return result.rows[0] || null;
}

/**
 * Finds the user's active planned training for today based on active plan and week_start_date.
 * @param {string|number} userId
 * @returns {Promise<{ intensity: string, hasSessionToday: boolean, planDayId: string|number }|null>}
 */
async function getTodaysPlannedTraining(userId) {
  const text = `
    SELECT pd.id AS plan_day_id, pd.intensity, pd.sport_id, 
           pd.session_type,
           EXISTS (
             SELECT 1 FROM plan_day_exercises pde 
             WHERE pde.plan_day_id = pd.id
           ) AS has_exercises
    FROM plans p
    JOIN plan_days pd ON pd.plan_id = p.id
    WHERE p.user_id = $1
      AND p.status = 'active'
      AND pd.day_index = (CURRENT_DATE - p.week_start_date) + 1
    LIMIT 1;
  `;
  const result = await db.query(text, [userId]);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    intensity: row.intensity,
    hasSessionToday: Boolean(row.has_exercises),
    planDayId: row.plan_day_id
  };
}

/**
 * Checks if a session already exists for today.
 * @param {string|number} userId
 * @returns {Promise<string|number|null>}
 */
async function getExistingSessionIdForToday(userId) {
  const text = `
    SELECT id
    FROM sessions
    WHERE user_id = $1 AND date = CURRENT_DATE
    LIMIT 1
  `;
  const result = await db.query(text, [userId]);
  return result.rows[0] ? result.rows[0].id : null;
}

/**
 * Saves or updates today's diet plan and meals.
 * @param {string|number} userId
 * @param {{ target_calories: number, target_protein_g: number, target_carbs_g: number, target_fat_g: number }} targets
 * @param {Array<Object>} meals
 * @param {string|number|null} [sessionId=null]
 * @returns {Promise<Object>}
 */
async function saveDietPlan(userId, targets, meals = [], sessionId = null) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const upsertLogQuery = `
      INSERT INTO diet_logs (user_id, session_id, date, target_calories, target_protein_g, target_carbs_g, target_fat_g)
      VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)
      ON CONFLICT (user_id, date) DO UPDATE SET
        target_calories = EXCLUDED.target_calories,
        target_protein_g = EXCLUDED.target_protein_g,
        target_carbs_g = EXCLUDED.target_carbs_g,
        target_fat_g = EXCLUDED.target_fat_g,
        session_id = COALESCE(EXCLUDED.session_id, diet_logs.session_id)
      RETURNING id, date, target_calories, target_protein_g, target_carbs_g, target_fat_g, session_id;
    `;
    const logResult = await client.query(upsertLogQuery, [
      userId,
      sessionId,
      targets.target_calories,
      targets.target_protein_g,
      targets.target_carbs_g,
      targets.target_fat_g
    ]);
    const savedLog = logResult.rows[0];
    const dietLogId = savedLog.id;

    // Delete existing meals for this diet log
    await client.query('DELETE FROM diet_log_meals WHERE diet_log_id = $1', [dietLogId]);

    // Insert new meals
    const savedMeals = [];
    const insertMealQuery = `
      INSERT INTO diet_log_meals (diet_log_id, slot, name, cuisine, calories, protein_g, carbs_g, fat_g)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, diet_log_id, slot, name, cuisine, calories, protein_g, carbs_g, fat_g;
    `;

    for (const meal of meals) {
      const mealResult = await client.query(insertMealQuery, [
        dietLogId,
        meal.slot,
        meal.name,
        meal.cuisine,
        meal.calories,
        meal.protein_g,
        meal.carbs_g,
        meal.fat_g
      ]);
      savedMeals.push(mealResult.rows[0]);
    }

    await client.query('COMMIT');

    return {
      date: savedLog.date,
      target_calories: savedLog.target_calories,
      target_protein_g: savedLog.target_protein_g,
      target_carbs_g: savedLog.target_carbs_g,
      target_fat_g: savedLog.target_fat_g,
      meals: savedMeals
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Links a session to an existing diet log if not already linked.
 * @param {string|number} userId
 * @param {string|Date} date
 * @param {string|number} sessionId
 * @returns {Promise<Object>}
 */
async function linkSessionToDietLog(userId, date, sessionId) {
  const text = `
    UPDATE diet_logs
    SET session_id = $3
    WHERE user_id = $1 AND date = $2 AND session_id IS NULL
    RETURNING id, user_id, session_id, date;
  `;
  const result = await db.query(text, [userId, date, sessionId]);
  return result.rows[0] || null;
}

/**
 * Retrieves the full diet plan and meals for a given date.
 * @param {string|number} userId
 * @param {string|Date} date
 * @returns {Promise<Object|null>}
 */
async function getDietPlanForDate(userId, date) {
  const text = `
    SELECT dl.id, dl.user_id, dl.session_id, dl.date, dl.target_calories, dl.target_protein_g, dl.target_carbs_g, dl.target_fat_g,
           m.id AS meal_id, m.slot, m.name, m.cuisine, m.calories, m.protein_g, m.carbs_g, m.fat_g
    FROM diet_logs dl
    LEFT JOIN diet_log_meals m ON m.diet_log_id = dl.id
    WHERE dl.user_id = $1 AND dl.date = $2
    ORDER BY m.id ASC;
  `;
  const result = await db.query(text, [userId, date]);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  const first = result.rows[0];
  const meals = result.rows
    .filter((row) => row.meal_id !== null)
    .map((row) => ({
      id: row.meal_id,
      diet_log_id: first.id,
      slot: row.slot,
      name: row.name,
      cuisine: row.cuisine,
      calories: row.calories,
      protein_g: row.protein_g,
      carbs_g: row.carbs_g,
      fat_g: row.fat_g
    }));

  return {
    id: first.id,
    user_id: first.user_id,
    session_id: first.session_id,
    date: first.date,
    target_calories: first.target_calories,
    target_protein_g: first.target_protein_g,
    target_carbs_g: first.target_carbs_g,
    target_fat_g: first.target_fat_g,
    meals
  };
}

/**
 * Retrieves a single meal by ID.
 * @param {string|number} mealId
 * @returns {Promise<Object|null>}
 */
async function getMealById(mealId) {
  const text = `
    SELECT id, name, cuisine, calories, protein_g, carbs_g, fat_g
    FROM diet_log_meals
    WHERE id = $1
  `;
  const result = await db.query(text, [mealId]);
  return result.rows[0] || null;
}

/**
 * Retrieves diet logs over a range of previous days.
 * @param {string|number} userId
 * @param {number} days
 * @returns {Promise<Array<Object>>}
 */
async function getDietLogsRange(userId, days) {
  const text = `
    SELECT date, target_protein_g, target_carbs_g
    FROM diet_logs
    WHERE user_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::interval
    ORDER BY date ASC;
  `;
  const result = await db.query(text, [userId, days]);
  return result.rows;
}

module.exports = {
  getUserProfile,
  getTodaysPlannedTraining,
  getExistingSessionIdForToday,
  saveDietPlan,
  linkSessionToDietLog,
  getDietPlanForDate,
  getMealById,
  getDietLogsRange
};
