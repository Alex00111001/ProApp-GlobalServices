const matches = (condition, context) => Object.entries(condition || {}).every(([key, expected]) => {
  const actual = context[key];
  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
});

const evaluateRefund = ({ rules, context, serviceAmountMinor, platformFeeMinor }) => {
  const rule = (rules || []).find((candidate) => matches(candidate.when, context));
  if (!rule) return { outcome: 'MANUAL_REVIEW', serviceRefundMinor: 0, platformFeeRefundMinor: 0, matchedRule: null };
  const serviceRefundMinor = Math.round(serviceAmountMinor * (rule.serviceRefundPercentage ?? 0) / 100);
  const platformFeeRefundMinor = Math.round(platformFeeMinor * (rule.platformFeeRefundPercentage ?? 0) / 100);
  return {
    outcome: rule.outcome || 'APPROVED',
    serviceRefundMinor,
    platformFeeRefundMinor,
    totalRefundMinor: serviceRefundMinor + platformFeeRefundMinor,
    matchedRule: rule.key,
  };
};

module.exports = { evaluateRefund, matches };
