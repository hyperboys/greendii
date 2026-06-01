const { validationResult } = require('express-validator');

/**
 * Express middleware that runs after a set of express-validator chains.
 * If any validation failed it responds with 400 and a Thai message listing
 * the offending fields; otherwise it passes control to the next handler.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return res.status(400).json({
    message: 'ข้อมูลไม่ถูกต้อง',
    errors,
  });
}

module.exports = { validate };
