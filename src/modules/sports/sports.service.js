// Sports service: business logic for sports domain
const sportsModel = require('./sports.model');

/**
 * Fetches all available sports
 * @returns {Promise<Array<{ id: number, slug: string, name: string }>>}
 */
const fetchAllSports = async () => {
  const sports = await sportsModel.getAllSports();
  return sports || [];
};

module.exports = {
  fetchAllSports,
};
