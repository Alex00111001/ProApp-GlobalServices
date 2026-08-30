const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuote } = require('../src/modules/billing/pricing/pricing.service');
const { evaluateRefund } = require('../src/modules/billing/refunds/refund-policy.service');
const { assertBalanced } = require('../src/modules/billing/ledger/ledger.service');

test('pricing separates customer fee from professional commission', () => {
  assert.deepEqual(calculateQuote({ serviceAmountMinor: 10_000, platformFeeBasisPoints: 800, commissionBasisPoints: 1500, currency: 'EUR' }), {
    currency: 'EUR', serviceAmountMinor: 10_000, platformFeeMinor: 800, customerTotalMinor: 10_800,
    professionalGrossMinor: 10_000, professionalCommissionMinor: 1_500,
    professionalPayoutMinor: 8_500, grossPlatformRevenueMinor: 2_300,
  });
});

test('refund rules independently decide service and platform fee', () => {
  const result = evaluateRefund({
    rules: [{ key: 'professional-cancelled', when: { whoCancelled: 'PROFESSIONAL' }, serviceRefundPercentage: 100, platformFeeRefundPercentage: 100 }],
    context: { whoCancelled: 'PROFESSIONAL' }, serviceAmountMinor: 10_000, platformFeeMinor: 800,
  });
  assert.equal(result.totalRefundMinor, 10_800);
  assert.equal(result.matchedRule, 'professional-cancelled');
});

test('refund defaults to manual review when no versioned rule matches', () => {
  assert.equal(evaluateRefund({ rules: [], context: {}, serviceAmountMinor: 100, platformFeeMinor: 10 }).outcome, 'MANUAL_REVIEW');
});

test('ledger rejects unbalanced postings', () => {
  assert.equal(assertBalanced([
    { direction: 'DEBIT', amountMinor: 100, currency: 'EUR' },
    { direction: 'CREDIT', amountMinor: 100, currency: 'EUR' },
  ]), true);
  assert.throws(() => assertBalanced([
    { direction: 'DEBIT', amountMinor: 100, currency: 'EUR' },
    { direction: 'CREDIT', amountMinor: 90, currency: 'EUR' },
  ]), /Unbalanced/);
});
