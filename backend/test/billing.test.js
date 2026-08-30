const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
const { calculateQuote, decimalToMinor } = require('../src/modules/billing/pricing/pricing.service');
const { evaluateRefund, percentageToBasisPoints, applyBasisPoints } = require('../src/modules/billing/refunds/refund-policy.service');
const { assertBalanced, postTransactionInTx } = require('../src/modules/billing/ledger/ledger.service');
const { normalizeCaptureAmounts, buildCaptureEntries } = require('../src/modules/billing/ledger/payment-capture-journal');
const { assertProviderAmount, applySuccessfulPayment } = require('../src/modules/billing/payments/payment-capture.service');
const { receiveEvent, processStripeEvent } = require('../src/modules/billing/payments/stripe-webhook.service');
const { allocateServiceRefund, buildRefundEntries } = require('../src/modules/billing/refunds/refund-journal');
const { createCancellationRefundRequestInTx } = require('../src/modules/billing/refunds/refund-request.service');
const { approveRefundInTx, rejectRefundInTx } = require('../src/modules/billing/refunds/refund-approval.service');

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

test('refund percentages use deterministic basis-point arithmetic', () => {
  assert.equal(percentageToBasisPoints('12.34'), 1234);
  assert.equal(applyBasisPoints(19_999, 1234), 2468);
  assert.throws(() => percentageToBasisPoints('100.01'), /cannot exceed/);
  assert.throws(() => percentageToBasisPoints('12.345'), /at most two/);
});

test('refund journal reverses captured economics proportionally and remains balanced', () => {
  const allocation = allocateServiceRefund({
    serviceRefundMinor: 5_000,
    serviceAmountMinor: 10_000,
    professionalCommissionMinor: 1_500,
  });
  assert.deepEqual(allocation, { commissionRefundMinor: 750, professionalPayableRefundMinor: 4_250 });

  const entries = buildRefundEntries({
    refund: { serviceRefundMinor: 5_000, platformFeeRefundMinor: 800 },
    capture: {
      customerTotalMinor: 10_800,
      serviceAmountMinor: 10_000,
      professionalCommissionMinor: 1_500,
      currency: 'EUR',
    },
    accountIds: {
      paymentClearing: 'asset',
      professionalPayable: 'liability',
      platformFeeRevenue: 'fee-revenue',
      commissionRevenue: 'commission-revenue',
    },
  });
  assert.equal(assertBalanced(entries), true);
  assert.equal(entries.at(-1).amountMinor, 5_800);
});

test('refund journal cannot exceed captured customer or service amounts', () => {
  assert.throws(() => allocateServiceRefund({
    serviceRefundMinor: 101,
    serviceAmountMinor: 100,
    professionalCommissionMinor: 10,
  }), /exceeds captured/);
  assert.throws(() => buildRefundEntries({
    refund: { serviceRefundMinor: 101, platformFeeRefundMinor: 0 },
    capture: { customerTotalMinor: 100, serviceAmountMinor: 100, professionalCommissionMinor: 10, currency: 'EUR' },
    accountIds: {},
  }), /cannot exceed/);
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

test('provider amount and currency must match the persisted payment', () => {
  const payment = { amount: '108.00', currency: 'EUR' };
  assert.doesNotThrow(() => assertProviderAmount({
    payment,
    providerAmountMinor: 10_800,
    providerCurrency: 'eur',
  }));
  assert.throws(() => assertProviderAmount({
    payment,
    providerAmountMinor: 10_799,
    providerCurrency: 'eur',
  }), /amount does not match/);
  assert.throws(() => assertProviderAmount({
    payment,
    providerAmountMinor: 10_800,
    providerCurrency: 'usd',
  }), /currency does not match/);
});

const createCaptureTx = ({ claimed = 1 } = {}) => {
  const calls = { outbox: 0, audit: 0, notification: 0, ledger: 0 };
  const payment = {
    id: 'payment-1',
    bookingId: 'booking-1',
    amount: '108.00',
    currency: 'EUR',
    status: claimed ? 'PROCESSING' : 'COMPLETED',
    transactionId: 'pi_1',
  };
  const booking = {
    id: 'booking-1',
    serviceAmount: '100.00',
    platformFee: '8.00',
    professionalCommission: '15.00',
    professionalEarnings: '85.00',
    currency: 'EUR',
    pricingSnapshot: { version: 1 },
    payment,
    professional: { userId: 'professional-user-1' },
  };
  const tx = {
    booking: {
      findUnique: async () => booking,
      update: async () => ({ ...booking, status: 'CONFIRMED', payment: { ...payment, status: 'COMPLETED' } }),
    },
    payment: { updateMany: async () => ({ count: claimed }) },
    ledgerAccount: {
      upsert: async ({ create }) => ({ id: `account-${create.code}`, ...create }),
    },
    ledgerTransaction: {
      findUnique: async () => null,
      create: async ({ data }) => {
        calls.ledger += 1;
        assert.equal(assertBalanced(data.entries.create.map((entry) => ({
          ...entry,
          amountMinor: decimalToMinor(entry.amount),
        }))), true);
        return { id: 'ledger-1', ...data };
      },
    },
    outboxEvent: { create: async () => { calls.outbox += 1; } },
    auditLog: { create: async () => { calls.audit += 1; } },
    notification: { create: async () => { calls.notification += 1; } },
  };
  return { tx, calls };
};

test('successful payment transition posts one balanced ledger transaction atomically', async () => {
  const { tx, calls } = createCaptureTx();
  const result = await applySuccessfulPayment({
    tx,
    bookingId: 'booking-1',
    providerTransactionId: 'pi_1',
    providerAmountMinor: 10_800,
    providerCurrency: 'eur',
    source: 'TEST',
    ledgerEnabled: true,
  });

  assert.equal(result.duplicate, false);
  assert.deepEqual(calls, { outbox: 1, audit: 1, notification: 1, ledger: 1 });
});

test('duplicate successful payment transition creates no repeated side effects', async () => {
  const { tx, calls } = createCaptureTx({ claimed: 0 });
  const result = await applySuccessfulPayment({
    tx,
    bookingId: 'booking-1',
    providerTransactionId: 'pi_1',
    providerAmountMinor: 10_800,
    providerCurrency: 'EUR',
    source: 'TEST_REPLAY',
    ledgerEnabled: true,
  });

  assert.equal(result.duplicate, true);
  assert.deepEqual(calls, { outbox: 0, audit: 0, notification: 0, ledger: 0 });
});

test('Stripe inbox returns the persisted record for a duplicate provider event', async () => {
  const persisted = { id: 'inbox-1', status: 'PROCESSED' };
  const client = {
    integrationEvent: {
      create: async () => { const error = new Error('duplicate'); error.code = 'P2002'; throw error; },
      findUnique: async () => persisted,
    },
  };
  const result = await receiveEvent({
    event: { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } },
    correlationId: 'correlation-1',
  }, client);

  assert.equal(result.duplicate, true);
  assert.equal(result.record, persisted);
});

test('processed Stripe webhook replay is acknowledged without opening a transaction', async () => {
  let transactionOpened = false;
  const client = {
    integrationEvent: {
      create: async () => { const error = new Error('duplicate'); error.code = 'P2002'; throw error; },
      findUnique: async () => ({ id: 'inbox-1', status: 'PROCESSED' }),
    },
    $transaction: async () => { transactionOpened = true; },
  };
  const result = await processStripeEvent({
    event: { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } },
    correlationId: 'correlation-1',
  }, client);

  assert.deepEqual(result, { duplicate: true, status: 'PROCESSED' });
  assert.equal(transactionOpened, false);
});

test('cancellation creates one versioned refund request without executing money movement', async () => {
  const calls = { refunds: 0, outbox: 0, audit: 0 };
  const policy = {
    id: 'policy-1',
    version: 3,
    country: 'ES',
    rules: [{
      key: 'professional-cancelled',
      when: { whoCancelled: 'PROFESSIONAL' },
      serviceRefundPercentage: 100,
      platformFeeRefundPercentage: 100,
    }],
  };
  const tx = {
    bookingPolicyAcceptance: { findFirst: async () => null },
    refundPolicy: { findMany: async () => [policy] },
    refund: {
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { totalAmount: null } }),
      create: async ({ data }) => {
        calls.refunds += 1;
        assert.equal(data.status, 'REQUESTED');
        assert.equal(data.totalAmount, '108.00');
        assert.equal(data.decisionRecord.create.policyVersion, 3);
        return { id: 'refund-1', ...data };
      },
    },
    outboxEvent: { create: async () => { calls.outbox += 1; } },
    auditLog: { create: async () => { calls.audit += 1; } },
  };
  const result = await createCancellationRefundRequestInTx({
    tx,
    booking: {
      id: 'booking-1',
      status: 'CONFIRMED',
      scheduledDate: new Date('2026-09-02T12:00:00Z'),
      serviceAmount: '100.00',
      platformFee: '8.00',
      professionalCommission: '15.00',
      professionalEarnings: '85.00',
      currency: 'EUR',
      pricingSnapshot: { version: 1 },
      client: { country: 'ES' },
      payment: { id: 'payment-1', status: 'COMPLETED', amount: '108.00', currency: 'EUR' },
    },
    requestedBy: 'user-1',
    whoCancelled: 'PROFESSIONAL',
    reason: 'Unavailable',
    cancelledAt: new Date('2026-09-01T12:00:00Z'),
  });

  assert.equal(result.outcome, 'APPROVED');
  assert.equal(result.refund.id, 'refund-1');
  assert.deepEqual(calls, { refunds: 1, outbox: 1, audit: 1 });
});

test('cancellation refund request is idempotent by booking', async () => {
  const existing = { id: 'refund-existing', status: 'REQUESTED' };
  const tx = { refund: { findUnique: async () => existing } };
  const result = await createCancellationRefundRequestInTx({
    tx,
    booking: {
      id: 'booking-1',
      payment: { id: 'payment-1', status: 'COMPLETED' },
    },
    requestedBy: 'user-1',
    whoCancelled: 'CLIENT',
    cancelledAt: new Date(),
  });

  assert.deepEqual(result, { outcome: 'EXISTING', refund: existing, duplicate: true });
});

test('refund approval enforces four-eyes separation', async () => {
  let updateCalled = false;
  const tx = {
    refund: {
      findUnique: async () => ({
        id: 'refund-1',
        status: 'REQUESTED',
        requestedBy: 'admin-1',
        totalAmount: '10.00',
      }),
      updateMany: async () => { updateCalled = true; },
    },
  };

  await assert.rejects(() => approveRefundInTx({
    tx,
    refundId: 'refund-1',
    approverId: 'admin-1',
  }), /requester cannot approve/);
  assert.equal(updateCalled, false);
});

test('refund approval is conditional, audited and emits one outbox event', async () => {
  const calls = { update: 0, outbox: 0, audit: 0 };
  const requested = {
    id: 'refund-1',
    bookingId: 'booking-1',
    paymentId: 'payment-1',
    status: 'REQUESTED',
    requestedBy: 'admin-1',
    totalAmount: '10.00',
  };
  const approved = { ...requested, status: 'APPROVED', approvedBy: 'admin-2' };
  let reads = 0;
  const tx = {
    refund: {
      findUnique: async () => (++reads === 1 ? requested : approved),
      updateMany: async () => { calls.update += 1; return { count: 1 }; },
    },
    outboxEvent: { create: async () => { calls.outbox += 1; } },
    auditLog: { create: async () => { calls.audit += 1; } },
  };
  const result = await approveRefundInTx({ tx, refundId: 'refund-1', approverId: 'admin-2' });

  assert.equal(result.duplicate, false);
  assert.equal(result.refund.status, 'APPROVED');
  assert.deepEqual(calls, { update: 1, outbox: 1, audit: 1 });
});

test('refund rejection is idempotent after the first reviewed transition', async () => {
  const rejected = { id: 'refund-1', status: 'REJECTED' };
  const tx = { refund: { findUnique: async () => rejected } };
  const result = await rejectRefundInTx({
    tx,
    refundId: 'refund-1',
    reviewerId: 'admin-2',
    reason: 'Policy exception denied',
  });

  assert.deepEqual(result, { refund: rejected, duplicate: true });
});
