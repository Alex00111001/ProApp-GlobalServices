const assertMinorUnits = (value, field) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
};

const percentageOf = (amountMinor, basisPoints) => {
  assertMinorUnits(amountMinor, 'amountMinor');
  if (!Number.isInteger(basisPoints) || basisPoints < 0) throw new TypeError('basisPoints must be a non-negative integer');
  return Math.round((amountMinor * basisPoints) / 10_000);
};

const calculateQuote = ({ serviceAmountMinor, platformFeeBasisPoints = 0, commissionBasisPoints = 0, currency }) => {
  assertMinorUnits(serviceAmountMinor, 'serviceAmountMinor');
  if (!/^[A-Z]{3}$/.test(currency || '')) throw new TypeError('currency must be an ISO 4217 code');
  const platformFeeMinor = percentageOf(serviceAmountMinor, platformFeeBasisPoints);
  const professionalCommissionMinor = percentageOf(serviceAmountMinor, commissionBasisPoints);
  return Object.freeze({
    currency,
    serviceAmountMinor,
    platformFeeMinor,
    customerTotalMinor: serviceAmountMinor + platformFeeMinor,
    professionalGrossMinor: serviceAmountMinor,
    professionalCommissionMinor,
    professionalPayoutMinor: serviceAmountMinor - professionalCommissionMinor,
    grossPlatformRevenueMinor: platformFeeMinor + professionalCommissionMinor,
  });
};

module.exports = { calculateQuote, percentageOf };
