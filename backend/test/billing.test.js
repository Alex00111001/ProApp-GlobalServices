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
const { assertProviderRefundMatches, assertRefundExecutable, finalizeRefundInTx, reconcileProviderRefundInTx, claimRefundForExecution, executeApprovedRefund } = require('../src/modules/billing/refunds/refund-execution.service');
const { buildPayoutEntries } = require('../src/modules/billing/payouts/payout-journal');
const { approvePayoutInTx } = require('../src/modules/billing/payouts/payout-approval.service');
const { assertPayoutExecutable, executeApprovedPayout } = require('../src/modules/billing/payouts/payout-execution.service');
const { buildTransferReversalEntries } = require('../src/modules/billing/disputes/dispute-journal');
const { mapDisputeStatus, validateProviderDispute, finalizeTransferReversalInTx } = require('../src/modules/billing/disputes/dispute.service');
const { comparePayoutTransfer } = require('../src/modules/billing/reconciliation/payout-reconciliation.service');

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

test('production financial configuration rejects Stripe test credentials', () => {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:password@database.example:5432/app',
    CORS_ORIGINS: 'https://app.example.com',
    JWT_SECRET: 'production-jwt-secret-with-at-least-32-characters',
    ADMIN_SESSION_PEPPER: 'production-admin-session-pepper-32-characters',
    GROWTH_PSEUDONYM_SECRET: 'g'.repeat(40),
    STRIPE_API_KEY: 'sk_test_not-allowed-in-production-1234567890',
    STRIPE_WEBHOOK_SECRET: 'whsec_production-placeholder-1234567890',
  };
  const result = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], { cwd: process.cwd(), env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString(), /live secret or restricted key/);
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
    professionalId: 'professional-1',
    serviceAmount: '100.00',
    platformFee: '8.00',
    professionalCommission: '15.00',
    professionalEarnings: '85.00',
    currency: 'EUR',
    pricingSnapshot: { version: 1 },
    payment,
    professional: { userId: 'professional-user-1' },
  };
  let paymentStatus = payment.status;
  const tx = {
    booking: {
      findUnique: async () => booking,
      update: async () => ({ ...booking, status: 'CONFIRMED' }),
    },
    payment: {
      findUnique: async () => ({ ...payment, status: paymentStatus }),
      updateMany: async () => {
        if (claimed) paymentStatus = 'COMPLETED';
        return { count: claimed };
      },
    },
    professionalProfile: { findUnique: async () => ({ userId: 'professional-user-1' }) },
    ledgerAccount: {
      upsert: async ({ create }) => ({ id: `account-${create.code}`, ...create }),
    },
    ledgerTransaction: {
      findUnique: async () => null,
      create: async ({ data }) => {
        calls.ledger += 1;
        assert.equal(assertBalanced(data.entries.createMany.data.map((entry) => ({
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

test('Stripe refund webhook is persisted and links a pending provider refund once', async () => {
  let linkedProviderRefundId = null;
  const refund = {
    id: 'refund-1',
    status: 'PROCESSING',
    providerRefundId: null,
    requestedBy: 'admin-1',
    approvedBy: 'admin-2',
    approvedAt: new Date('2026-08-31T10:00:00Z'),
    decisionRecord: { id: 'decision-1' },
    totalAmount: '108.00',
    currency: 'EUR',
    payment: { transactionId: 'pi_1' },
  };
  const tx = {
    refund: {
      findUnique: async () => refund,
      update: async ({ data }) => {
        linkedProviderRefundId = data.providerRefundId;
        return { ...refund, ...data };
      },
    },
    integrationEvent: { update: async () => {} },
  };
  const client = {
    integrationEvent: {
      create: async () => ({ id: 'inbox-refund-1', status: 'RECEIVED' }),
      updateMany: async () => ({ count: 1 }),
      update: async () => {},
    },
    $transaction: async (callback) => callback(tx),
  };
  const result = await processStripeEvent({
    event: {
      id: 'evt_refund_1',
      type: 'refund.updated',
      created: 1_788_134_400,
      data: { object: {
        id: 're_pending',
        status: 'pending',
        amount: 10_800,
        currency: 'eur',
        payment_intent: 'pi_1',
        metadata: { refundId: 'refund-1' },
      } },
    },
    correlationId: 'correlation-refund-1',
  }, client);

  assert.deepEqual(result, { duplicate: false, status: 'PROCESSED' });
  assert.equal(linkedProviderRefundId, 're_pending');
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

const executableRefundFixture = (overrides = {}) => ({
  id: 'refund-1',
  bookingId: 'booking-1',
  paymentId: 'payment-1',
  status: 'APPROVED',
  requestedBy: 'admin-1',
  approvedBy: 'admin-2',
  approvedAt: new Date('2026-08-31T10:00:00Z'),
  processingStartedAt: null,
  providerRefundId: null,
  serviceAmount: '100.00',
  platformFeeAmount: '8.00',
  totalAmount: '108.00',
  currency: 'EUR',
  booking: {
    id: 'booking-1',
    serviceAmount: '100.00',
    platformFee: '8.00',
    professionalCommission: '15.00',
    professionalEarnings: '85.00',
    pricingSnapshot: { version: 1 },
    currency: 'EUR',
    client: { userId: 'client-user-1' },
  },
  payment: {
    id: 'payment-1',
    amount: '108.00',
    currency: 'EUR',
    method: 'STRIPE',
    transactionId: 'pi_1',
    status: 'COMPLETED',
  },
  decisionRecord: { id: 'decision-1' },
  ...overrides,
});

test('refund execution preflight rejects component over-refunds before provider calls', () => {
  const refund = executableRefundFixture({
    serviceAmount: '10.00',
    platformFeeAmount: '0.00',
    totalAmount: '10.00',
  });
  assert.throws(() => assertRefundExecutable({
    refund,
    previouslyRefundedMinor: 9_500,
    previousServiceRefundMinor: 9_500,
    previousPlatformFeeRefundMinor: 0,
  }), /service amount exceeds/);
});

test('provider refund identity must match approved internal evidence', () => {
  const refund = executableRefundFixture();
  assert.doesNotThrow(() => assertProviderRefundMatches({
    providerRefund: {
      id: 're_1',
      amount: 10_800,
      currency: 'eur',
      payment_intent: 'pi_1',
      metadata: { refundId: 'refund-1' },
    },
    refund,
    refundMinor: 10_800,
  }));
  assert.throws(() => assertProviderRefundMatches({
    providerRefund: { id: 're_wrong', amount: 10_700, currency: 'eur', payment_intent: 'pi_1' },
    refund,
    refundMinor: 10_800,
  }), /amount does not match/);
  assert.throws(() => assertProviderRefundMatches({
    providerRefund: { id: 're_wrong', amount: 10_800, currency: 'eur', payment_intent: 'pi_1', metadata: {} },
    refund,
    refundMinor: 10_800,
  }), /metadata does not match/);
});

test('failed Stripe refund event preserves provider evidence and emits operational records', async () => {
  const refund = executableRefundFixture({ status: 'PROCESSING' });
  const calls = { outbox: 0, audit: 0 };
  const tx = {
    refund: {
      findUnique: async () => refund,
      update: async ({ data }) => ({ ...refund, ...data }),
    },
    outboxEvent: {
      create: async ({ data }) => {
        calls.outbox += 1;
        assert.equal(data.eventType, 'refund.failed');
      },
    },
    auditLog: {
      create: async ({ data }) => {
        calls.audit += 1;
        assert.equal(data.metadata.source, 'STRIPE_WEBHOOK');
      },
    },
  };
  const result = await reconcileProviderRefundInTx({
    tx,
    providerRefund: {
      id: 're_failed',
      status: 'failed',
      failure_reason: 'lost_or_stolen_card',
      amount: 10_800,
      currency: 'eur',
      payment_intent: 'pi_1',
      metadata: { refundId: 'refund-1' },
    },
    ledgerEnabled: false,
  });

  assert.equal(result.refund.status, 'FAILED');
  assert.equal(result.refund.providerRefundId, 're_failed');
  assert.equal(result.refund.failureReason, 'lost_or_stolen_card');
  assert.deepEqual(calls, { outbox: 1, audit: 1 });
});

test('completed refund replay never calls Stripe', async () => {
  let stripeCalled = false;
  const refund = executableRefundFixture({ status: 'COMPLETED', providerRefundId: 're_1' });
  const result = await executeApprovedRefund({
    refundId: refund.id,
    executorId: 'admin-3',
    stripeClient: { refunds: { create: async () => { stripeCalled = true; } } },
    ledgerEnabled: false,
    client: { refund: { findUnique: async () => refund } },
  });

  assert.equal(result.duplicate, true);
  assert.equal(stripeCalled, false);
});

test('refund execution is blocked after a professional payout until explicit recovery', async () => {
  const refund = executableRefundFixture();
  const client = {
    refund: { findUnique: async () => refund },
    payout: { findUnique: async () => ({ id: 'payout-1', status: 'COMPLETED' }) },
    $queryRaw: async () => [{ id: refund.paymentId }],
    $transaction: async (callback) => callback(client),
  };
  await assert.rejects(() => claimRefundForExecution({
    client,
    refundId: refund.id,
    ledgerEnabled: false,
  }), /payout adjustment or recovery/);
});

test('refund execution sends a stable Stripe idempotency key after claiming its lease', async () => {
  const refund = executableRefundFixture();
  let stripeRequest = null;
  let transactionCalls = 0;
  const client = {
    refund: {
      findUnique: async () => refund,
      aggregate: async () => ({ _sum: { totalAmount: null, serviceAmount: null, platformFeeAmount: null } }),
      findFirst: async () => null,
      updateMany: async () => ({ count: 1 }),
    },
    $queryRaw: async () => [{ id: refund.paymentId }],
    $transaction: async (callback) => {
      transactionCalls += 1;
      if (transactionCalls === 1) return callback(client);
      return { refund: { ...refund, status: 'COMPLETED' }, duplicate: false };
    },
  };
  const stripeClient = {
    refunds: {
      create: async (payload, options) => {
        stripeRequest = { payload, options };
        return {
          id: 're_1',
          status: 'succeeded',
          amount: 10_800,
          currency: 'eur',
          payment_intent: 'pi_1',
          metadata: { refundId: 'refund-1' },
        };
      },
    },
  };
  const result = await executeApprovedRefund({
    refundId: refund.id,
    executorId: 'admin-3',
    stripeClient,
    ledgerEnabled: false,
    client,
  });

  assert.equal(result.pending, false);
  assert.equal(stripeRequest.payload.amount, 10_800);
  assert.equal(stripeRequest.payload.payment_intent, 'pi_1');
  assert.equal(stripeRequest.options.idempotencyKey, 'refund:refund-1:execute');
});

test('successful full refund finalization updates projections and posts one reversal', async () => {
  const refund = executableRefundFixture({ status: 'PROCESSING' });
  const calls = { ledger: 0, payment: null, booking: 0, outbox: 0, audit: 0, notification: 0 };
  const tx = {
    refund: {
      findUnique: async () => refund,
      aggregate: async () => ({ _sum: { totalAmount: null, serviceAmount: null, platformFeeAmount: null } }),
      update: async ({ data }) => ({ ...refund, ...data }),
    },
    ledgerTransaction: {
      findUnique: async ({ where }) => where.idempotencyKey.startsWith('payment:') ? { id: 'capture-ledger' } : null,
      create: async ({ data }) => {
        calls.ledger += 1;
        assert.equal(data.refundId, refund.id);
        assert.equal(assertBalanced(data.entries.createMany.data.map((entry) => ({
          ...entry,
          amountMinor: decimalToMinor(entry.amount),
        }))), true);
        return { id: 'refund-ledger', ...data };
      },
    },
    ledgerAccount: {
      upsert: async ({ create }) => ({ id: `account-${create.code}`, ...create }),
    },
    payment: { update: async ({ data }) => { calls.payment = data; } },
    booking: { update: async () => { calls.booking += 1; } },
    outboxEvent: { create: async () => { calls.outbox += 1; } },
    auditLog: { create: async () => { calls.audit += 1; } },
    notification: { create: async () => { calls.notification += 1; } },
  };
  const result = await finalizeRefundInTx({
    tx,
    refundId: refund.id,
    providerRefundId: 're_1',
    executorId: 'admin-3',
    ledgerEnabled: true,
  });

  assert.equal(result.duplicate, false);
  assert.equal(calls.payment.status, 'REFUNDED');
  assert.equal(calls.payment.refundAmount, '108.00');
  assert.deepEqual(
    { ledger: calls.ledger, booking: calls.booking, outbox: calls.outbox, audit: calls.audit, notification: calls.notification },
    { ledger: 1, booking: 1, outbox: 1, audit: 1, notification: 1 }
  );
});

test('payout and transfer-reversal journals remain balanced in minor units', () => {
  const accountIds = { professionalPayable: 'payable', paymentClearing: 'clearing' };
  const payout = buildPayoutEntries({ amountMinor: 8_500, currency: 'EUR', accountIds });
  const reversal = buildTransferReversalEntries({ amountMinor: 5_000, currency: 'EUR', accountIds });
  assert.equal(assertBalanced(payout), true);
  assert.equal(assertBalanced(reversal), true);
  assert.throws(() => buildPayoutEntries({ amountMinor: 0, currency: 'EUR', accountIds }), /positive/);
});

test('payout approval enforces four-eyes and writes one audited transition', async () => {
  const requested = {
    id: 'payout-1',
    bookingId: 'booking-1',
    professionalId: 'professional-1',
    status: 'REQUESTED',
    requestedBy: 'professional-user-1',
    booking: { status: 'COMPLETED' },
    payment: { status: 'COMPLETED' },
    earning: { status: 'PENDING' },
    professional: { stripeAccountId: 'acct_1' },
  };
  let reads = 0;
  const calls = { update: 0, outbox: 0, audit: 0 };
  const tx = {
    payout: {
      findUnique: async () => (++reads === 1 ? requested : { ...requested, status: 'APPROVED', approvedBy: 'admin-1' }),
      updateMany: async () => { calls.update += 1; return { count: 1 }; },
    },
    outboxEvent: { create: async () => { calls.outbox += 1; } },
    auditLog: { create: async () => { calls.audit += 1; } },
  };
  const result = await approvePayoutInTx({ tx, payoutId: requested.id, approverId: 'admin-1' });
  assert.equal(result.payout.status, 'APPROVED');
  assert.deepEqual(calls, { update: 1, outbox: 1, audit: 1 });

  await assert.rejects(() => approvePayoutInTx({
    tx: { payout: { findUnique: async () => requested } },
    payoutId: requested.id,
    approverId: requested.requestedBy,
  }), /requester cannot approve/);
});

const executablePayoutFixture = (overrides = {}) => ({
  id: 'payout-1',
  bookingId: 'booking-1',
  paymentId: 'payment-1',
  earningId: 'earning-1',
  professionalId: 'professional-1',
  idempotencyKey: 'booking:booking-1:professional-payout',
  status: 'APPROVED',
  amount: '85.00',
  reversedAmount: '0.00',
  currency: 'EUR',
  connectedAccountId: 'acct_1',
  requestedBy: 'professional-user-1',
  approvedBy: 'admin-1',
  approvedAt: new Date('2026-08-31T12:00:00Z'),
  booking: { id: 'booking-1', status: 'COMPLETED' },
  payment: { id: 'payment-1', status: 'COMPLETED', transactionId: 'pi_1', providerChargeId: 'ch_1' },
  earning: { id: 'earning-1', status: 'PENDING', netAmount: '85.00' },
  professional: { id: 'professional-1', stripeAccountId: 'acct_1', user: { id: 'professional-user-1' } },
  ...overrides,
});

test('payout execution requires distinct requester, approver and executor identities', () => {
  const payout = executablePayoutFixture();
  assert.throws(() => assertPayoutExecutable({ payout, executorId: payout.approvedBy }), /approver cannot execute/);
  assert.doesNotThrow(() => assertPayoutExecutable({ payout, executorId: 'admin-2' }));
});

test('payout execution verifies Connect capability and sends one stable transfer command', async () => {
  const payout = executablePayoutFixture();
  let transferRequest;
  let accountInclude;
  let transactionCalls = 0;
  const client = {
    payout: {
      findUnique: async () => payout,
      updateMany: async () => ({ count: 1 }),
    },
    booking: { findUnique: async () => payout.booking },
    payment: { findUnique: async () => payout.payment },
    earning: { findUnique: async () => payout.earning },
    professionalProfile: { findUnique: async () => payout.professional },
    dispute: { findFirst: async () => null },
    refund: { count: async () => 0 },
    $queryRaw: async () => [{ id: payout.id }],
    $transaction: async (callback) => {
      transactionCalls += 1;
      if (transactionCalls === 1) return callback(client);
      return { payout: { ...payout, status: 'COMPLETED', providerTransferId: 'tr_1' }, duplicate: false };
    },
  };
  const stripeClient = {
    v2: { core: { accounts: { retrieve: async (_id, params) => {
      accountInclude = params.include;
      return { id: 'acct_1', configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } } };
    } } } },
    paymentIntents: { retrieve: async () => ({ id: 'pi_1', status: 'succeeded', latest_charge: 'ch_1', metadata: { bookingId: 'booking-1' } }) },
    transfers: { create: async (payload, options) => {
      transferRequest = { payload, options };
      return { id: 'tr_1', ...payload };
    } },
  };
  const result = await executeApprovedPayout({
    payoutId: payout.id,
    executorId: 'admin-2',
    stripeClient,
    ledgerEnabled: false,
    client,
  });
  assert.equal(result.payout.status, 'COMPLETED');
  assert.deepEqual(accountInclude, ['configuration.recipient']);
  assert.equal(transferRequest.payload.amount, 8_500);
  assert.equal(transferRequest.payload.source_transaction, 'ch_1');
  assert.equal(transferRequest.options.idempotencyKey, payout.idempotencyKey);
});

test('Stripe dispute evidence maps to bounded internal states', () => {
  assert.equal(mapDisputeStatus('needs_response'), 'OPEN');
  assert.equal(mapDisputeStatus('under_review'), 'UNDER_REVIEW');
  assert.equal(mapDisputeStatus('won'), 'WON');
  assert.equal(mapDisputeStatus('lost'), 'LOST');
  assert.deepEqual(validateProviderDispute({
    id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1', amount: 5_000, currency: 'eur', status: 'needs_response',
  }), { chargeId: 'ch_1', paymentIntentId: 'pi_1', amountMinor: 5_000, currency: 'EUR' });
  assert.throws(() => validateProviderDispute({ id: 'dp_1', amount: 0 }), /canonical/);
});

test('dispute recovery finalization records one balanced immutable transfer reversal', async () => {
  const payout = executablePayoutFixture({ status: 'COMPLETED', providerTransferId: 'tr_1' });
  const dispute = {
    id: 'dispute-1', bookingId: 'booking-1', paymentId: 'payment-1', payoutId: payout.id,
    providerTransferReversalId: null, recoveredAmount: '0.00', amount: '50.00', currency: 'EUR', payout,
  };
  const calls = { ledger: 0, outbox: 0, audit: 0 };
  const tx = {
    $queryRaw: async () => [{ id: dispute.id }],
    dispute: {
      findUnique: async () => dispute,
      update: async ({ data }) => ({ ...dispute, ...data }),
    },
    payout: { update: async ({ data }) => ({ ...payout, ...data }) },
    ledgerAccount: { upsert: async ({ create }) => ({ id: `account-${create.code}`, ...create }) },
    ledgerTransaction: {
      findUnique: async () => null,
      create: async ({ data }) => {
        calls.ledger += 1;
        const entries = data.entries.createMany.data.map((entry) => ({ ...entry, amountMinor: decimalToMinor(entry.amount) }));
        assert.equal(assertBalanced(entries), true);
        return { id: 'ledger-reversal-1', ...data };
      },
    },
    outboxEvent: { create: async () => { calls.outbox += 1; } },
    auditLog: { create: async () => { calls.audit += 1; } },
  };
  const result = await finalizeTransferReversalInTx({
    tx,
    disputeId: dispute.id,
    providerReversal: { id: 'trr_1', amount: 5_000, transfer: 'tr_1', metadata: { disputeId: dispute.id, payoutId: payout.id } },
    amountMinor: 5_000,
    ledgerEnabled: true,
  });
  assert.equal(result.dispute.providerTransferReversalId, 'trr_1');
  assert.equal(result.payout.reversedAmount, '50.00');
  assert.deepEqual(calls, { ledger: 1, outbox: 1, audit: 1 });
});

test('payout reconciliation detects provider, earning and ledger drift', () => {
  const payout = executablePayoutFixture({
    status: 'COMPLETED',
    providerTransferId: 'tr_1',
    ledgerTransactions: [{ entries: [
      { direction: 'DEBIT', amount: '85.00' },
      { direction: 'CREDIT', amount: '85.00' },
    ] }],
  });
  const transfer = {
    id: 'tr_1', amount: 8_500, amount_reversed: 0, currency: 'eur', destination: 'acct_1', source_transaction: 'ch_1',
    metadata: { payoutId: 'payout-1', bookingId: 'booking-1' },
  };
  assert.equal(comparePayoutTransfer({ payout, transfer, requireLedger: true }).status, 'MATCHED');
  assert.deepEqual(
    comparePayoutTransfer({ payout, transfer: { ...transfer, amount: 8_400 }, requireLedger: true }).details.mismatches,
    ['amountMinor']
  );
});
