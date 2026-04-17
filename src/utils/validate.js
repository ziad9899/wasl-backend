const { ValidationError } = require('../errors');

const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const input = source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const result = schema.safeParse(input);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
        rule: i.code,
      }));
      return next(new ValidationError('Validation failed', details));
    }
    if (source === 'query') req.query = result.data;
    else if (source === 'params') req.params = result.data;
    else req.body = result.data;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = validate;
