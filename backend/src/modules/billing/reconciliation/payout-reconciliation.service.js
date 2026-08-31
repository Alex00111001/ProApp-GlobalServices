const prisma = require('../../../config/prisma');
const { decimalToMinor } = require('../pricing/pricing.service');

const providerId = (value) => (typeof value === 'string' ? value : value?.id);

const comparePayoutTransfer = ({ payout, transfer, requireLedger = false }) => {
  const expected = {
    amountMinor: decimalToMinor(payout.amount),
    reversedAmountMinor: decimalToMinor(payout.reversedAmount),
    currency: payout.currency,
    destination: payout.connectedAccountId,
    sourceTransaction: payout.payment.providerChargeId,
    payoutId: payout.id,
    bookingId: payout.bookingId,
    ledgerRequired: requireLedger,
  };
  const entries = payout.ledgerTransactions.flatMap((transaction) => transaction.entries || []);
  const ledgerDebitMinor = entries
    .filter((entry) => entry.direction === 'DEBIT')
    .reduce((sum, entry) => sum + decimalToMinor(entry.amount), 0);
  const ledgerCreditMinor = entries
    .filter((entry) => entry.direction === 'CREDIT')
    .reduce((sum, entry) => sum + decimalToMinor(entry.amount), 0);
  const actual = {
    amountMinor: transfer?.amount,
    reversedAmountMinor: transfer?.amount_reversed || 0,
    currency: String(transfer?.currency || '').toUpperCase(),
    destination: providerId(transfer?.destination),
    sourceTransaction: providerId(transfer?.source_transaction),
    payoutId: transfer?.metadata?.payoutId,
    bookingId: transfer?.metadata?.bookingId,
    earningAmountMinor: decimalToMinor(payout.earning.netAmount),
    ledgerTransactions: payout.ledgerTransactions.length,
    ledgerDebitMinor,
    ledgerCreditMinor,
  };
  const mismatches = [];
  for (const key of ['amountMinor', 'reversedAmountMinor', 'currency', 'destination', 'sourceTransaction', 'payoutId', 'bookingId']) {
    if (expected[key] !== actual[key]) mismatches.push(key);
  }
  if (expected.amountMinor !== actual.earningAmountMinor) mismatches.push('earningAmountMinor');
  if (ledgerDebitMinor !== ledgerCreditMinor) mismatches.push('ledgerBalance');
  if (requireLedger && payout.ledgerTransactions.length === 0) mismatches.push('ledgerTransaction');
  return {
    status: mismatches.length ? 'MISMATCH' : 'MATCHED',
    expected,
    actual,
    details: { mismatches },
  };
};

const runPayoutReconciliation = async ({
  initiatedBy,
  stripeClient,
  requireLedger,
  requestContext = {},
  limit = 100,
  client = prisma,
}) => {
  const run = await client.reconciliationRun.create({
    data: {
      scope: 'PAYOUTS',
      initiatedBy,
      metadata: { limit, requireLedger, provider: 'STRIPE' },
    },
  });

  try {
    const payouts = await client.payout.findMany({
      where: { providerTransferId: { not: null }, status: { in: ['COMPLETED', 'REVERSED'] } },
      orderBy: { processedAt: 'asc' },
      take: limit,
      include: {
        payment: true,
        earning: true,
        ledgerTransactions: { where: { status: 'POSTED' }, include: { entries: true } },
      },
    });
    const items = [];
    for (const payout of payouts) {
      try {
        const transfer = await stripeClient.transfers.retrieve(payout.providerTransferId);
        const comparison = comparePayoutTransfer({ payout, transfer, requireLedger });
        items.push({
          runId: run.id,
          bookingId: payout.bookingId,
          resourceType: 'Payout',
          resourceId: payout.id,
          category: 'STRIPE_TRANSFER',
          ...comparison,
        });
      } catch (error) {
        items.push({
          runId: run.id,
          bookingId: payout.bookingId,
          resourceType: 'Payout',
          resourceId: payout.id,
          category: 'STRIPE_TRANSFER',
          status: error?.code === 'resource_missing' ? 'MISSING' : 'ERROR',
          expected: { providerTransferId: payout.providerTransferId },
          details: { code: error?.code || 'PROVIDER_READ_FAILED' },
        });
      }
    }

    const matchedCount = items.filter((item) => item.status === 'MATCHED').length;
    const mismatchCount = items.filter((item) => ['MISMATCH', 'MISSING'].includes(item.status)).length;
    const errorCount = items.filter((item) => item.status === 'ERROR').length;
    const completedAt = new Date();
    const completed = await client.$transaction(async (tx) => {
      if (items.length) await tx.reconciliationItem.createMany({ data: items });
      const updated = await tx.reconciliationRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt, matchedCount, mismatchCount, errorCount },
      });
      await tx.auditLog.create({
        data: {
          actorId: initiatedBy,
          action: 'reconciliation.completed',
          resourceType: 'ReconciliationRun',
          resourceId: run.id,
          outcome: 'SUCCESS',
          after: { scope: run.scope, matchedCount, mismatchCount, errorCount },
          metadata: { provider: 'STRIPE', scannedCount: items.length, requireLedger },
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
          traceId: requestContext.traceId,
        },
      });
      return updated;
    });
    return { run: completed, items };
  } catch (error) {
    await client.reconciliationRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', completedAt: new Date(), metadata: { limit, requireLedger, errorCode: 'RUN_FAILED' } },
    });
    throw error;
  }
};

module.exports = { comparePayoutTransfer, runPayoutReconciliation };
