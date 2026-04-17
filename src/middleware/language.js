const setLanguage = (req, res, next) => {
  const lang = req.headers['accept-language'];
  req.lang   = lang === 'en' ? 'en' : 'ar';
  next();
};

module.exports = setLanguage;