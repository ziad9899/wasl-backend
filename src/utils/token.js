const jwt = require('jsonwebtoken');

const generateAccessToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: expiresIn || process.env.JWT_ACCESS_EXPIRES || '15m',
  });

const generateRefreshToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: expiresIn || process.env.JWT_REFRESH_EXPIRES || '30d',
  });

const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token) => jwt.verify(token, process.env.JWT_REFRESH_SECRET);

const generateAdminAccessToken = (payload, expiresIn) =>
  jwt.sign(
    { ...payload, aud: 'admin' },
    process.env.JWT_ADMIN_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET,
    { expiresIn: expiresIn || process.env.JWT_ADMIN_ACCESS_EXPIRES || '1h' }
  );

const generateAdminRefreshToken = (payload, expiresIn) =>
  jwt.sign(
    { ...payload, aud: 'admin' },
    process.env.JWT_ADMIN_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET,
    { expiresIn: expiresIn || process.env.JWT_ADMIN_REFRESH_EXPIRES || '7d' }
  );

const verifyAdminAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ADMIN_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET);

const verifyAdminRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_ADMIN_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET);

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
};
