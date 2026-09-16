// Sports controller: handles request/response for sports endpoints
const sportsService = require('./sports.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * Controller handler to get all sports
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getSports = async (req, res, next) => {
  try {
    const sportsArray = await sportsService.fetchAllSports();
    return sendSuccess(res, sportsArray, 'Sports fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getSports,
};
