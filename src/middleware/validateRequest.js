// Schema validation middleware helper
/**
 * Generic request validation middleware
 * @param {Function} validatorFn - Function receiving req.body returning { isValid, error }
 * @returns {import('express').RequestHandler}
 */
const validateRequest = (validatorFn) => {
  return (req, res, next) => {
    const { isValid, error } = validatorFn(req.body);
    if (!isValid) {
      const err = new Error(error || 'Invalid request payload');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      return next(err);
    }
    next();
  };
};

module.exports = validateRequest;
