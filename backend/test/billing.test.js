const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { calculateQuote, decimalToMinor } = require('../src/modules/billing/pricing/pricing.service');
const { evaluateRefund } = require('../src/modules/billing/refunds/refund-policy.service');
const { assertBalanced, postTransactionInTx } = require('../src/modules/billing/ledger/ledger.service');
const { normalizeCaptureAmounts, buildCaptureEntries } = require('../src/modules/billing/ledger/payment-capture-journal');

test('pricing separates customer fee from professional commission', () => {
  assert.deepEqual(calculateQuote({ serviceAmountMinor: 10_000, platformFeeBasisPoints: 800, commissionBasisPoints: 1500, currency: 'EUR' }), {
    currency: 'EUR', serviceAmountMinor: 10_000, platformFeeMinor: 800, customerTotalMinor: 10_800,
    professionalGrossMinor: 10_000, professionalCommissionMinor: 1_500,
    professionalPayoutMinor: 8_500, grossPlatformRevenueMinor: 2_300,
  });
});

test('decimal prices convert to minor units without binary float arithmetic', () => {
  assert.equal(decimalToMinor('19.99'), 1999);
  assert.equal(decimalToMinor('20'), 2000);
  assert.throws(() => decimalToMinor('invalid'));
  assert.throws(() => decimalToMinor('10.999'));
});

test('production pricing configuration fails closed when commercial rates are absent', () => {
  const env = { ...process.env, NODE_ENV: 'production', LEGAL_DOCUMENT_VERSION: 'v1', STRIPE_CURRENCY: 'eur' };
  delete env.PROFESSIONAL_COMMISSION_PERCENTAGE;
  delete env.PLATFORM_FEE_PERCENTAGE;
  delete env.CLIENT_PLATFORM_FEE_PERCENTAGE;
  const result = spawnSync(process.execPath, ['-e', "require('./src/config/business')"], { cwd: process.cwd(), env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString(), /PROFESSIONAL_COMMISSION_PERCENTAGE must be configured/);
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

test('payment capture journal balances separated customer fees and professional commissions', () => {
  const amounts = normalizeCaptureAmounts({
    booking: {
      pricingSnapshot: { version: 1 },
      serviceAmount: '100.00',
      platformFee: '8.00',
      professionalCommission: '15.00',
      professionalEarnings: '85.00',
      currency: 'EUR',
    },
    payment: { amount: '108.00', currency: 'EUR' },
  });
  const entries = buildCaptureEntries(amounts, {
    paymentClearing: 'asset',
    professionalPayable: 'liability',
    platformFeeRevenue: 'fee-revenue',
    commissionRevenue: 'commission-revenue',
  });

  assert.equal(amounts.pricingMode, 'SEPARATED');
  assert.equal(amounts.platformFeeMinor, 800);
  assert.equal(amounts.professionalCommissionMinor, 1500);
  assert.equal(assertBalanced(entries), true);
});

test('payment capture journal preserves legacy platformFee commission semantics', () => {
  const amounts = normalizeCaptureAmounts({
    booking: {
      pricingSnapshot: null,
      serviceAmount: '0.00',
      platformFee: '15.00',
      professionalCommission: '0.00',
      professionalEarnings: '85.00',
      currency: 'EUR',
    },
    payment: { amount: '100.00', currency: 'EUR' },
  });

  assert.deepEqual(amounts, {
    currency: 'EUR',
    customerTotalMinor: 10_000,
    serviceAmountMinor: 10_000,
    platformFeeMinor: 0,
    professionalCommissionMinor: 1_500,
    professionalPayoutMinor: 8_500,
    pricingMode: 'LEGACY_COMPATIBILITY',
  });
});

test('payment capture journal rejects inconsistent projections', () => {
  assert.throws(() => normalizeCaptureAmounts({
    booking: {
      pricingSnapshot: { version: 1 },
      serviceAmount: '100.00',
      platformFee: '8.00',
      professionalCommission: '15.00',
      professionalEarnings: '85.00',
      currency: 'EUR',
    },
    payment: { amount: '107.99', currency: 'EUR' },
  }), /Payment total does not match/);
});

test('ledger posting can participate in an existing transaction without nesting', async () => {
  const existing = { id: 'ledger-1', entries: [] };
  let createCalled = false;
  const tx = {
    ledgerTransaction: {
      findUnique: async () => existing,
      create: async () => {
        createCalled = true;
      },
    },
  };
  const result = await postTransactionInTx({
    idempotencyKey: 'payment:one:capture',
    entries: [
      { accountId: 'asset', entryType: 'SERVICE_CHARGE', direction: 'DEBIT', amountMinor: 100, currency: 'EUR' },
      { accountId: 'liability', entryType: 'PROFESSIONAL_PAYOUT', direction: 'CREDIT', amountMinor: 100, currency: 'EUR' },
    ],
  }, tx);

  assert.equal(result, existing);
  assert.equal(createCalled, false);
});
