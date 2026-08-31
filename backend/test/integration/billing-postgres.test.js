require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { receiveEvent } = require('../../src/modules/billing/payments/stripe-webhook.service');
const { applySuccessfulPayment } = require('../../src/modules/billing/payments/payment-capture.service');
const { executeApprovedRefund } = require('../../src/modules/billing/refunds/refund-execution.service');
const { executeApprovedPayout } = require('../../src/modules/billing/payouts/payout-execution.service');
const { decimalToMinor } = require('../../src/modules/billing/pricing/pricing.service');

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true to run database integration tests deliberately.');
}
if (!process.env.DIRECT_URL) {
  throw new Error('DIRECT_URL must point to the isolated Supabase test database.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Database integration tests refuse to run with NODE_ENV=production.');
}

const createPrisma = () => new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
});
const prisma = createPrisma();

const usingClients = async (count, callback) => {
  const clients = Array.from({ length: count }, () => createPrisma());
  try {
    return await callback(clients);
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
};

const runId = randomUUID();
const ids = {
  user: randomUUID(),
  requester: randomUUID(),
  approver: randomUUID(),
  executor: randomUUID(),
  professionalUser: randomUUID(),
  professional: randomUUID(),
  client: randomUUID(),
  booking: randomUUID(),
  payment: randomUUID(),
  earning: randomUUID(),
  payout: randomUUID(),
  policy: randomUUID(),
  refundA: randomUUID(),
  refundB: randomUUID(),
  inboxEvent: `evt_integration_${runId}`,
};

const cleanup = async () => {
  const ledgerTransactions = await prisma.ledgerTransaction.findMany({
    where: { OR: [{ bookingId: ids.booking }, { paymentId: ids.payment }, { refundId: { in: [ids.refundA, ids.refundB] } }] },
    select: { id: true },
  }).catch(() => []);
  const ledgerTransactionIds = ledgerTransactions.map((item) => item.id);
  if (ledgerTransactionIds.length) {
    await prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: ledgerTransactionIds } } });
    await prisma.ledgerTransaction.deleteMany({ where: { id: { in: ledgerTransactionIds } } });
  }
  await prisma.dispute.deleteMany({ where: { bookingId: ids.booking } }).catch(() => {});
  await prisma.payout.deleteMany({ where: { id: ids.payout } }).catch(() => {});
  await prisma.earning.deleteMany({ where: { id: ids.earning } }).catch(() => {});
  await prisma.refundDecision.deleteMany({ where: { refundId: { in: [ids.refundA, ids.refundB] } } }).catch(() => {});
  await prisma.refund.deleteMany({ where: { id: { in: [ids.refundA, ids.refundB] } } }).catch(() => {});
  await prisma.refundPolicy.deleteMany({ where: { id: ids.policy } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { bookingId: ids.booking } }).catch(() => {});
  await prisma.outboxEvent.deleteMany({
    where: { OR: [{ aggregateId: ids.payment }, { aggregateId: { in: [ids.refundA, ids.refundB, ids.payout] } }] },
  }).catch(() => {});
  await prisma.auditLog.deleteMany({
    where: { resourceId: { in: [ids.payment, ids.refundA, ids.refundB, ids.payout] } },
  }).catch(() => {});
  await prisma.payment.deleteMany({ where: { id: ids.payment } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { id: ids.booking } }).catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { id: ids.client } }).catch(() => {});
  await prisma.professionalProfile.deleteMany({ where: { id: ids.professional } }).catch(() => {});
  await prisma.user.deleteMany({
    where: { id: { in: [ids.user, ids.requester, ids.approver, ids.executor, ids.professionalUser] } },
  }).catch(() => {});
  await prisma.integrationEvent.deleteMany({
    where: { provider: 'STRIPE_TEST', providerEventId: ids.inboxEvent },
  }).catch(() => {});
};

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('Supabase enforces inbox, capture, payout and refund concurrency invariants', async () => {
  await cleanup();
  const existingAccounts = new Set((await prisma.ledgerAccount.findMany({
    where: { currency: 'EUR' },
    select: { id: true },
  })).map((account) => account.id));

  try {
    const inboxEvent = {
      id: ids.inboxEvent,
      type: 'integration.test',
      data: { object: { runId } },
    };
    const inboxResults = await usingClients(8, (clients) => Promise.all(clients.map((client) => receiveEvent({
      event: inboxEvent,
      correlationId: `integration-${runId}`,
    }, {
      integrationEvent: {
        create: ({ data }) => client.integrationEvent.create({ data: { ...data, provider: 'STRIPE_TEST' } }),
        findUnique: () => client.integrationEvent.findUnique({
          where: { provider_providerEventId: { provider: 'STRIPE_TEST', providerEventId: ids.inboxEvent } },
        }),
      },
    }))));
    assert.equal(inboxResults.filter((result) => !result.duplicate).length, 1);
    assert.equal(await prisma.integrationEvent.count({
      where: { provider: 'STRIPE_TEST', providerEventId: ids.inboxEvent },
    }), 1);

    await prisma.user.createMany({
      data: [
        {
          id: ids.user,
          email: `integration-client-${runId}@example.invalid`,
          phone: `+3491${runId.replace(/-/g, '').slice(0, 7)}`,
          passwordHash: 'integration-only',
          firstName: 'Integration',
          lastName: 'Client',
          role: 'CLIENT',
        },
        {
          id: ids.requester,
          email: `integration-requester-${runId}@example.invalid`,
          phone: `+3492${runId.replace(/-/g, '').slice(0, 7)}`,
          passwordHash: 'integration-only',
          firstName: 'Integration',
          lastName: 'Requester',
          role: 'ADMIN',
        },
        {
          id: ids.approver,
          email: `integration-approver-${runId}@example.invalid`,
          phone: `+3493${runId.replace(/-/g, '').slice(0, 7)}`,
          passwordHash: 'integration-only',
          firstName: 'Integration',
          lastName: 'Approver',
          role: 'ADMIN',
        },
        {
          id: ids.executor,
          email: `integration-executor-${runId}@example.invalid`,
          phone: `+3494${runId.replace(/-/g, '').slice(0, 7)}`,
          passwordHash: 'integration-only',
          firstName: 'Integration',
          lastName: 'Executor',
          role: 'ADMIN',
        },
        {
          id: ids.professionalUser,
          email: `integration-professional-${runId}@example.invalid`,
          phone: `+3495${runId.replace(/-/g, '').slice(0, 7)}`,
          passwordHash: 'integration-only',
          firstName: 'Integration',
          lastName: 'Professional',
          role: 'PROFESSIONAL',
        },
      ],
    });
    await prisma.clientProfile.create({
      data: { id: ids.client, userId: ids.user, country: 'ES', paymentMethods: [] },
    });
    await prisma.professionalProfile.create({
      data: {
        id: ids.professional,
        userId: ids.professionalUser,
        status: 'APPROVED',
        stripeAccountId: `acct_integration_${runId}`,
        stripeTransfersStatus: 'active',
        stripeAccountUpdatedAt: new Date(),
      },
    });
    await prisma.booking.create({
      data: {
        id: ids.booking,
        clientId: ids.client,
        professionalId: ids.professional,
        status: 'PENDING',
        scheduledDate: new Date(Date.now() + 86_400_000),
        address: 'Integration test only',
        city: 'Madrid',
        state: 'Madrid',
        postalCode: '28001',
        totalPrice: '108.00',
        serviceAmount: '100.00',
        platformFee: '8.00',
        professionalCommission: '15.00',
        professionalEarnings: '85.00',
        currency: 'EUR',
        pricingSnapshot: { version: 1, source: 'integration-test' },
      },
    });
    await prisma.payment.create({
      data: {
        id: ids.payment,
        bookingId: ids.booking,
        amount: '108.00',
        currency: 'EUR',
        status: 'PROCESSING',
        method: 'STRIPE',
        transactionId: `pi_integration_${runId}`,
        providerChargeId: `ch_integration_${runId}`,
      },
    });

    const capture = (client) => client.$transaction((tx) => applySuccessfulPayment({
      tx,
      bookingId: ids.booking,
      providerTransactionId: `pi_integration_${runId}`,
      providerChargeId: `ch_integration_${runId}`,
      providerAmountMinor: 10_800,
      providerCurrency: 'eur',
      source: 'POSTGRES_INTEGRATION_TEST',
      ledgerEnabled: true,
    }));
    const captureResults = await usingClients(2, (clients) => Promise.all(clients.map(capture)));
    assert.equal(captureResults.filter((result) => !result.duplicate).length, 1);
    assert.equal(captureResults.filter((result) => result.duplicate).length, 1);
    assert.equal(await prisma.ledgerTransaction.count({ where: { paymentId: ids.payment } }), 1);
    assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: ids.payment, eventType: 'payment.completed' } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: ids.payment, action: 'payment.completed' } }), 1);

    const captureEntries = await prisma.ledgerEntry.findMany({
      where: { transaction: { paymentId: ids.payment } },
    });
    const captureDebit = captureEntries
      .filter((entry) => entry.direction === 'DEBIT')
      .reduce((sum, entry) => sum + decimalToMinor(entry.amount), 0);
    const captureCredit = captureEntries
      .filter((entry) => entry.direction === 'CREDIT')
      .reduce((sum, entry) => sum + decimalToMinor(entry.amount), 0);
    assert.equal(captureDebit, captureCredit);
    assert.equal(captureDebit, 10_800);

    await prisma.booking.update({ where: { id: ids.booking }, data: { status: 'COMPLETED', completedAt: new Date() } });
    await prisma.earning.create({
      data: {
        id: ids.earning,
        professionalId: ids.professional,
        bookingId: ids.booking,
        amount: '100.00',
        platformFee: '15.00',
        netAmount: '85.00',
        status: 'PENDING',
      },
    });
    await prisma.payout.create({
      data: {
        id: ids.payout,
        bookingId: ids.booking,
        paymentId: ids.payment,
        earningId: ids.earning,
        professionalId: ids.professional,
        idempotencyKey: `integration-payout:${runId}`,
        status: 'APPROVED',
        amount: '85.00',
        currency: 'EUR',
        connectedAccountId: `acct_integration_${runId}`,
        requestedBy: ids.professionalUser,
        approvedBy: ids.approver,
        approvedAt: new Date(),
      },
    });

    let stripeTransferCalls = 0;
    const payoutStripeClient = {
      v2: { core: { accounts: { retrieve: async () => ({
        id: `acct_integration_${runId}`,
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } },
      }) } } },
      paymentIntents: { retrieve: async () => ({
        id: `pi_integration_${runId}`,
        status: 'succeeded',
        latest_charge: `ch_integration_${runId}`,
        metadata: { bookingId: ids.booking },
      }) },
      transfers: { create: async (payload) => {
        stripeTransferCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { id: `tr_integration_${runId}`, ...payload };
      } },
    };
    const executePayout = (client) => executeApprovedPayout({
      payoutId: ids.payout,
      executorId: ids.executor,
      stripeClient: payoutStripeClient,
      ledgerEnabled: true,
      client,
      requestContext: { correlationId: `integration-${runId}` },
    });
    const concurrentPayouts = await usingClients(2, (clients) => Promise.allSettled(clients.map(executePayout)));
    assert.equal(concurrentPayouts.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrentPayouts.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(stripeTransferCalls, 1);
    assert.equal((await prisma.payout.findUnique({ where: { id: ids.payout } })).status, 'COMPLETED');
    assert.equal((await prisma.earning.findUnique({ where: { id: ids.earning } })).status, 'PAID');
    assert.equal(await prisma.ledgerTransaction.count({ where: { payoutId: ids.payout } }), 1);
    assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: ids.payout, eventType: 'payout.completed' } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: ids.payout, action: 'payout.completed' } }), 1);
    const payoutReplay = await executePayout(prisma);
    assert.equal(payoutReplay.duplicate, true);
    assert.equal(stripeTransferCalls, 1);

    const payoutLedger = await prisma.ledgerTransaction.findMany({
      where: { payoutId: ids.payout },
      select: { id: true },
    });
    await prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: payoutLedger.map((item) => item.id) } } });
    await prisma.ledgerTransaction.deleteMany({ where: { id: { in: payoutLedger.map((item) => item.id) } } });
    await prisma.payout.delete({ where: { id: ids.payout } });
    await prisma.earning.delete({ where: { id: ids.earning } });

    await prisma.refundPolicy.create({
      data: {
        id: ids.policy,
        key: `integration-${runId}`,
        version: 1,
        country: 'ES',
        status: 'ACTIVE',
        rules: [],
        effectiveAt: new Date(),
      },
    });
    for (const refundId of [ids.refundA, ids.refundB]) {
      await prisma.refund.create({
        data: {
          id: refundId,
          bookingId: ids.booking,
          paymentId: ids.payment,
          refundPolicyId: ids.policy,
          idempotencyKey: `integration-refund:${refundId}`,
          status: 'APPROVED',
          serviceAmount: '60.00',
          platformFeeAmount: '0.00',
          totalAmount: '60.00',
          currency: 'EUR',
          decision: { source: 'integration-test' },
          requestedBy: ids.requester,
          approvedBy: ids.approver,
          approvedAt: new Date(),
          decisionRecord: {
            create: {
              refundPolicyId: ids.policy,
              policyVersion: 1,
              country: 'ES',
              context: { source: 'integration-test' },
              outcome: 'APPROVED',
              serviceRefundAmount: '60.00',
              platformFeeRefundAmount: '0.00',
              totalRefundAmount: '60.00',
              currency: 'EUR',
            },
          },
        },
      });
    }

    let stripeCreateCalls = 0;
    const stripeClient = {
      refunds: {
        create: async (payload) => {
          stripeCreateCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            id: `re_integration_${payload.metadata.refundId}`,
            status: 'succeeded',
            amount: payload.amount,
            currency: 'eur',
            payment_intent: `pi_integration_${runId}`,
            metadata: payload.metadata,
          };
        },
      },
    };
    const execute = (refundId, client = prisma) => executeApprovedRefund({
      refundId,
      executorId: ids.approver,
      stripeClient,
      ledgerEnabled: true,
      client,
      requestContext: { correlationId: `integration-${runId}` },
    });
    const concurrentRefunds = await usingClients(2, (clients) => Promise.allSettled([
      execute(ids.refundA, clients[0]),
      execute(ids.refundB, clients[1]),
    ]));
    assert.equal(concurrentRefunds.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrentRefunds.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(stripeCreateCalls, 1);

    const refunds = await prisma.refund.findMany({
      where: { id: { in: [ids.refundA, ids.refundB] } },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(refunds.map((refund) => refund.status).sort(), ['APPROVED', 'COMPLETED']);
    const approvedRefund = refunds.find((refund) => refund.status === 'APPROVED');
    await assert.rejects(() => execute(approvedRefund.id), /exceeds|in progress/);
    assert.equal(stripeCreateCalls, 1);

    const payment = await prisma.payment.findUnique({ where: { id: ids.payment } });
    assert.equal(payment.status, 'COMPLETED');
    assert.equal(decimalToMinor(payment.refundAmount), 6_000);
    assert.equal(await prisma.ledgerTransaction.count({
      where: { paymentId: ids.payment, refundId: { not: null } },
    }), 1);
  } finally {
    await cleanup();
    const createdAccounts = await prisma.ledgerAccount.findMany({
      where: { currency: 'EUR', id: { notIn: [...existingAccounts] }, entries: { none: {} } },
      select: { id: true },
    });
    if (createdAccounts.length) {
      await prisma.ledgerAccount.deleteMany({ where: { id: { in: createdAccounts.map((item) => item.id) } } });
    }
  }
});
