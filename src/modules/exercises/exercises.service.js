// Exercises service: business logic for exercises domain
const exercisesModel = require('./exercises.model');

// UUID format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fetches exercises with optional sportId filtering
 * @param {number|string} [sportId]
 * @returns {Promise<Array<object>>}
 */
const fetchExercises = async (sportId = null) => {
  let parsedSportId = null;

  if (sportId !== undefined && sportId !== null && sportId !== '') {
    const numericId = Number(sportId);
    if (isNaN(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
      const error = new Error('Sport ID must be a valid positive integer');
      error.code = 'INVALID_SPORT_ID';
      error.statusCode = 400;
      throw error;
    }
    parsedSportId = numericId;
  }

  const exercises = await exercisesModel.getExercises(parsedSportId);
  return exercises || [];
};

/**
 * Fetches single exercise details including substitute exercises
 * @param {string} exerciseId
 * @returns {Promise<object>}
 */
const fetchExerciseDetail = async (exerciseId) => {
  if (!exerciseId || typeof exerciseId !== 'string' || !UUID_REGEX.test(exerciseId.trim())) {
    const error = new Error('Exercise not found');
    error.code = 'EXERCISE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const exercise = await exercisesModel.getExerciseById(exerciseId.trim());
  if (!exercise) {
    const error = new Error('Exercise not found');
    error.code = 'EXERCISE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const substitutes = await exercisesModel.getSubstituteExercises(exerciseId.trim());

  return {
    ...exercise,
    substitutes: substitutes || [],
  };
};

module.exports = {
  fetchExercises,
  fetchExerciseDetail,
};
