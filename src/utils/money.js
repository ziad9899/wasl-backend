const sarToHalalas = (sar) => Math.round(Number(sar) * 100);

const halalasToSar = (halalas) => Math.round(Number(halalas)) / 100;

const formatSar = (halalas) => {
  const value = halalasToSar(halalas);
  return `${value.toFixed(2)} SAR`;
};

const calculateCommission = (amountHalalas, rate) => {
  const rateDecimal = rate > 1 ? rate / 100 : rate;
  return Math.round(amountHalalas * rateDecimal);
};

const calculateProviderPayout = (amountHalalas, commissionAmount) => amountHalalas - commissionAmount;

module.exports = {
  sarToHalalas,
  halalasToSar,
  formatSar,
  calculateCommission,
  calculateProviderPayout,
};
