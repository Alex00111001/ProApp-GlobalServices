const prisma = require('../../../config/prisma');
const stripe = require('../../../config/stripe');
const { logError } = require('../../observability/safe-log');
const { buildAlertRequest } = require('../../observability/alerting.service');
const { telemetryMetadata } = require('../../observability/context');
const { persistPreparedPaymentIntent } = require('./payment-intent-preparation.service');

const recordIntentIncident = async ({
  db,
  bookingId,
  paymentIntentId,
  reason,
  requestContext,
  kind,
}) => {
  const persistenceUnknown = kind === 'PERSISTENCE_UNKNOWN';
  const deduplicationKey = persistenceUnknown
    ? `payment-intent:persistence-unknown:${paymentIntentId}`
    : `payment-intent:cleanup-failed:${paymentIntentId}`;
  await db.$transaction(async (tx) => {
    const created = await tx.incident.createMany({
      data: {
        deduplicationKey,
        title: persistenceUnknown
          ? 'Payment intent persistence is uncertain'
          : 'Payment intent requires reconciliation',
        description: persistenceUnknown
          ? `Review the provider intent and persisted payment state for booking ${bookingId}.`
          : `Review the provider intent for booking ${bookingId}; automatic cancellation did not complete.`,
        service: 'billing', severity: 'HIGH',
      },
      skipDuplicates: true,
    });
    if (created.count === 0) return;
    const incident = await tx.incident.findUnique({ where: { deduplicationKey } });
    await tx.incidentEvent.create({
      data: {
        incidentId: incident.id,
        eventType: persistenceUnknown
          ? 'PAYMENT_INTENT_PERSISTENCE_UNKNOWN'
          : 'PAYMENT_INTENT_CLEANUP_FAILED',
        metadata: { bookingId, paymentIntentId, reason },
      },
    });
    const alert = buildAlertRequest(incident, requestContext);
    if (alert) await tx.outboxEvent.create({
      data: {
        aggregateType: 'Incident', aggregateId: incident.id, eventType: 'incident.alert_requested',
        payload: alert.payload, metadata: telemetryMetadata(requestContext, alert.metadata),
      },
    });
  });
};

const cleanupRejectedIntent = async ({
  bookingId,
  paymentIntent,
  persisted,
  reason,
  requestContext = {},
  req,
  db = prisma,
  stripeClient = stripe,
}) => {
  if (persisted.payment?.transactionId === paymentIntent.id
    && ['COMPLETED', 'REFUNDED'].includes(persisted.payment.status)) return;
  if (paymentIntent.status === 'canceled') return;
  try {
    if (paymentIntent.status === 'succeeded') throw new Error('Provider intent already succeeded');
    const cancelled = await stripeClient.paymentIntents.cancel(paymentIntent.id);
    if (cancelled.status !== 'canceled') throw new Error('Provider did not confirm payment intent cancellation');
  } catch (error) {
    logError(req, error, 'Payment intent cancellation requires reconciliation');
    await recordIntentIncident({
      db,
      bookingId,
      paymentIntentId: paymentIntent.id,
      reason,
      requestContext,
      kind: 'CLEANUP_FAILED',
    });
  }
};

const reconcileUncertainIntentPersistence = async ({
  bookingId,
  amountMinor,
  currency,
  paymentIntent,
  expectedTransactionId,
  requestContext = {},
  req,
  db = prisma,
}) => {
  try {
    const persisted = await persistPreparedPaymentIntent({
      db,
      bookingId,
      amountMinor,
      currency,
      paymentIntentId: paymentIntent.id,
      expectedTransactionId,
    });
    return { resolved: true, persisted };
  } catch (retryError) {
    logError(req, retryError, 'Payment intent persistence remains uncertain after transactional recovery');
    try {
      await recordIntentIncident({
        db,
        bookingId,
        paymentIntentId: paymentIntent.id,
        reason: 'PERSISTENCE_STATE_UNKNOWN',
        requestContext,
        kind: 'PERSISTENCE_UNKNOWN',
      });
    } catch (incidentError) {
      logError(req, incidentError, 'Payment intent persistence incident could not be recorded');
    }
    return { resolved: false, retryError };
  }
};

module.exports = {
  cleanupRejectedIntent,
  reconcileUncertainIntentPersistence,
  recordIntentIncident,
};
