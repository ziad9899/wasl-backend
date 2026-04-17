const Config    = require('../models/Config');
const { error } = require('../utils/response');

const checkWorkingHours = async (req, res, next) => {
  try {
    const workingHours = await Config.get('workingHours');
    if (!workingHours) return next();

    const now  = new Date();
    const hour = now.getUTCHours() + 3;
    const [startH] = workingHours.start.split(':').map(Number);
    const [endH]   = workingHours.end.split(':').map(Number);

    const normalizedHour = hour >= 24 ? hour - 24 : hour;

    if (normalizedHour < startH || normalizedHour >= endH) {
      return error(
        res,
        `Service available from ${workingHours.start} to ${workingHours.end}`,
        503
      );
    }
    next();
  } catch (_) {
    next();
  }
};

module.exports = checkWorkingHours;