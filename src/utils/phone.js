const normalizeSaudiPhone = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, '');

  if (/^\+9665\d{8}$/.test(digits)) return digits;
  if (/^009665\d{8}$/.test(digits)) return `+${digits.substring(2)}`;
  if (/^9665\d{8}$/.test(digits)) return `+${digits}`;
  if (/^05\d{8}$/.test(digits)) return `+966${digits.substring(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;

  return null;
};

const isValidSaudiPhone = (phone) => normalizeSaudiPhone(phone) !== null;

const maskPhone = (phone) => {
  const norm = normalizeSaudiPhone(phone) || phone;
  if (!norm || norm.length < 8) return norm;
  return `${norm.substring(0, 5)}****${norm.substring(norm.length - 3)}`;
};

module.exports = { normalizeSaudiPhone, isValidSaudiPhone, maskPhone };
