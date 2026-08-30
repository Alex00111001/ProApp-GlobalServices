const matches = (condition, context) => Object.entries(condition || {}).every(([key, expected]) => {
  const actual = context[key];
  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
});

const percentageToBasisPoints = (value) => {
  const normalized = String(value ?? 0).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) throw new TypeError('Refund percentages must have at most two decimal places');
  const [whole, fraction = ''] = normalized.split('.');
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (basisPoints > 10_000) throw new RangeError('Refund percentages cannot exceed 100');
  return basisPoints;
};

const applyBasisPoints = (amountMinor, basisPoints) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new TypeError('Refund bases must be non-negative minor units');
  const rounded = (BigInt(amountMinor) * BigInt(basisPoints) + 5_000n) / 10_000n;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError('Refund amount exceeds safe minor-unit range');
  return result;
};

const evaluateRefund = ({ rules, context, serviceAmountMinor, platformFeeMinor }) => {
  const rule = (Array.isArray(rules) ? rules : []).find((candidate) => matches(candidate.when, context));
  if (!rule) return { outcome: 'MANUAL_REVIEW', serviceRefundMinor: 0, platformFeeRefundMinor: 0, matchedRule: null };
  const serviceRefundMinor = applyBasisPoints(serviceAmountMinor, percentageToBasisPoints(rule.serviceRefundPercentage));
  const platformFeeRefundMinor = applyBasisPoints(platformFeeMinor, percentageToBasisPoints(rule.platformFeeRefundPercentage));
  return {
    outcome: rule.outcome || 'APPROVED',
    serviceRefundMinor,
    platformFeeRefundMinor,
    totalRefundMinor: serviceRefundMinor + platformFeeRefundMinor,
    matchedRule: rule.key,
  };
};

module.exports = { evaluateRefund, matches, percentageToBasisPoints, applyBasisPoints };
