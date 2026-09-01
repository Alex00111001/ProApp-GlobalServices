const prisma = require('../../../config/prisma');
const env = require('../../../config/env');
const { applySuccessfulPayment } = require('./payment-capture.service');
const { reconcileProviderRefundInTx } = require('../refunds/refund-execution.service');
const { reconcileProviderDispute } = require('../disputes/dispute.service');
const { telemetryMetadata } = require('../../observability/context');
const { observeExternalOperation } = require('../../observability/metrics');

const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const REFUND_EVENT_TYPES = new Set(['refund.created', 'refund.updated', 'refund.failed']);
const DISPUTE_EVENT_TYPES = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]);

const isUniqueConstraintError = (error) => error?.code === 'P2002';

const validateStripeEvent = (event) => {
  if (!event?.id || !event?.type || !event?.data?.object) {
    throw new TypeError('Stripe event is missing its canonical identity or payload');
  }
};

const receiveEvent = async ({ event, requestContext = {}, correlationId = requestContext.correlationId }, client = prisma) => {
  validateStripeEvent(event);
  try {
    const record = await client.integrationEvent.create({
      data: {
        provider: 'STRIPE',
        providerEventId: event.id,
        eventType: event.type,
        payload: event,
        correlationId,
      },
    });
    return { record, duplicate: false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const record = await client.integrationEvent.findUnique({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: event.id } },
    });
    return { record, duplicate: true };
  }
};

const processStripeEvent = async ({ event, requestContext = {}, correlationId = requestContext.correlationId }, client = prisma, stripeClient) => {
  const received = await receiveEvent({ event, requestContext, correlationId }, client);
  if (!received.record) throw new Error('Unable to load persisted Stripe event');
  if (received.record.status === 'PROCESSED' || received.record.status === 'DEAD_LETTER') {
    return { duplicate: true, status: received.record.status };
  }

  const leaseExpiredBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
  const claimed = await client.integrationEvent.updateMany({
    where: {
      id: received.record.id,
      OR: [
        { status: { in: ['RECEIVED', 'FAILED'] } },
        { status: 'PROCESSING', processingStartedAt: { lt: leaseExpiredBefore } },
      ],
    },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      processingStartedAt: new Date(),
      lastError: null,
    },
  });
  if (claimed.count === 0) return { duplicate: true, status: 'PROCESSING' };

  try {
    if (DISPUTE_EVENT_TYPES.has(event.type)) {
      if (env.financialDisputeRecoveryEnabled && !stripeClient) {
        throw new Error('Stripe client is required for dispute recovery');
      }
      const result = await reconcileProviderDispute({
        providerDispute: event.data.object,
        eventType: event.type,
        providerEventAt: event.created ? new Date(event.created * 1000) : new Date(),
        recoveryEnabled: env.financialDisputeRecoveryEnabled,
        ledgerEnabled: env.financialLedgerDualWriteEnabled,
        stripeClient,
        requestContext: { ...requestContext, correlationId },
        client,
      });
      await client.integrationEvent.update({
        where: { id: received.record.id },
        data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
      });
      observeExternalOperation({ provider: 'stripe', operation: event.type, outcome: result?.duplicate ? 'duplicate' : 'success' });
      return { duplicate: received.duplicate || Boolean(result?.duplicate), status: 'PROCESSED' };
    }

    const financialResult = await client.$transaction(async (tx) => {
      const providerObject = event.data.object;
      const bookingId = providerObject.metadata?.bookingId;
      let result = null;

      if (bookingId && event.type === 'payment_intent.succeeded') {
        result = await applySuccessfulPayment({
          tx,
          bookingId,
          providerTransactionId: providerObject.id,
          providerChargeId: typeof providerObject.latest_charge === 'string'
            ? providerObject.latest_charge
            : providerObject.latest_charge?.id,
          providerAmountMinor: providerObject.amount_received || providerObject.amount,
          providerCurrency: providerObject.currency,
          processedAt: event.created ? new Date(event.created * 1000) : new Date(),
          source: 'STRIPE_WEBHOOK',
          ledgerEnabled: env.financialLedgerDualWriteEnabled,
          requestContext: { ...requestContext, correlationId },
        });
      } else if (bookingId && event.type === 'payment_intent.payment_failed') {
        const payment = await tx.payment.findUnique({ where: { bookingId } });
        if (payment?.transactionId === providerObject.id && payment.status !== 'COMPLETED') {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              failedReason: providerObject.last_payment_error?.message || 'Pago rechazado',
            },
          });
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'Payment',
              aggregateId: payment.id,
              eventType: 'payment.failed',
              payload: { bookingId, paymentId: payment.id, source: 'STRIPE_WEBHOOK' },
              metadata: telemetryMetadata(requestContext, { providerTransactionId: providerObject.id }),
            },
          });
        }
      } else if (REFUND_EVENT_TYPES.has(event.type)) {
        result = await reconcileProviderRefundInTx({
          tx,
          providerRefund: providerObject,
          ledgerEnabled: env.financialLedgerDualWriteEnabled,
          processedAt: event.created ? new Date(event.created * 1000) : new Date(),
          requestContext: { ...requestContext, correlationId },
          source: 'STRIPE_WEBHOOK',
        });
      }

      await tx.integrationEvent.update({
        where: { id: received.record.id },
        data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
      });
      return result;
    });
    observeExternalOperation({ provider: 'stripe', operation: event.type, outcome: financialResult?.duplicate ? 'duplicate' : 'success' });
    return { duplicate: received.duplicate || Boolean(financialResult?.duplicate), status: 'PROCESSED' };
  } catch (error) {
    observeExternalOperation({ provider: 'stripe', operation: event.type, outcome: 'failure' });
    await client.integrationEvent.update({
      where: { id: received.record.id },
      data: { status: 'FAILED', lastError: String(error.message || error).slice(0, 1000) },
    });
    throw error;
  }
};

module.exports = {
  PROCESSING_LEASE_MS,
  REFUND_EVENT_TYPES,
  DISPUTE_EVENT_TYPES,
  validateStripeEvent,
  receiveEvent,
  processStripeEvent,
};
