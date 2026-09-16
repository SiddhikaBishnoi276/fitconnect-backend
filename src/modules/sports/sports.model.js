// Sports model: database queries for sports reference data
const db = require('../../config/db');

/**
 * Fetches all sports from the database (id, slug, name)
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Array<{ id: number, slug: string, name: string }>>}
 */
const getAllSports = async (client = null) => {
  const executor = client || db;
  const result = await executor.query(
    'SELECT id, slug, name FROM sports ORDER BY id ASC;'
  );
  return result.rows;
};

module.exports = {
  getAllSports,
};
