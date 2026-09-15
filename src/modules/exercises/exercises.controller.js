// Exercises controller: handles request/response for exercises endpoints
const exercisesService = require('./exercises.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * Controller handler for fetching exercises list
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getExercises = async (req, res, next) => {
  try {
    const { sport_id } = req.query;
    const exercisesArray = await exercisesService.fetchExercises(sport_id);
    return sendSuccess(res, exercisesArray, 'Exercises fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler for fetching single exercise detail
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getExerciseDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const exerciseDetail = await exercisesService.fetchExerciseDetail(id);
    return sendSuccess(res, exerciseDetail, 'Exercise detail fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getExercises,
  getExerciseDetail,
};
