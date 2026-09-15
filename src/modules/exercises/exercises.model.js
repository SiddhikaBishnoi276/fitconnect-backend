// Exercises model: database queries for exercise library
const db = require('../../config/db');

/**
 * Fetches exercises from database, optionally filtered by sport_id
 * @param {number|null} [sportId]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getExercises = async (sportId = null, client = null) => {
  const executor = client || db;

  if (sportId !== null && sportId !== undefined) {
    const queryText = `
      SELECT 
        id, name, sport_id, load_tags, default_sets,
        default_reps_min, default_reps_max, demo_media_url,
        contraindicated_body_parts
      FROM exercises
      WHERE sport_id = $1
      ORDER BY name ASC;
    `;
    const result = await executor.query(queryText, [sportId]);
    return result.rows;
  }

  const queryText = `
    SELECT 
      id, name, sport_id, load_tags, default_sets,
      default_reps_min, default_reps_max, demo_media_url,
      contraindicated_body_parts
    FROM exercises
    ORDER BY name ASC;
  `;
  const result = await executor.query(queryText);
  return result.rows;
};

/**
 * Fetches a single exercise by ID
 * @param {string} exerciseId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
const getExerciseById = async (exerciseId, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT 
      id, name, sport_id, load_tags, default_sets,
      default_reps_min, default_reps_max, demo_media_url,
      contraindicated_body_parts
    FROM exercises
    WHERE id = $1;
  `;
  const result = await executor.query(queryText, [exerciseId]);
  return result.rows[0] || null;
};

/**
 * Fetches all substitute exercises for a given exercise ID
 * @param {string} exerciseId
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<object>>}
 */
const getSubstituteExercises = async (exerciseId, client = null) => {
  const executor = client || db;
  const queryText = `
    SELECT 
      e.id, e.name, e.sport_id, e.load_tags, e.default_sets,
      e.default_reps_min, e.default_reps_max, e.demo_media_url,
      e.contraindicated_body_parts
    FROM exercise_substitutes es
    JOIN exercises e ON es.substitute_exercise_id = e.id
    WHERE es.exercise_id = $1
    ORDER BY e.name ASC;
  `;
  const result = await executor.query(queryText, [exerciseId]);
  return result.rows;
};

module.exports = {
  getExercises,
  getExerciseById,
  getSubstituteExercises,
};
