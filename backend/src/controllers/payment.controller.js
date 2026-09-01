const stripe = require('../config/stripe');
const prisma = require('../config/prisma');

const { PAYMENT_CURRENCY: STRIPE_CURRENCY } = require('../config/business');
const env = require('../config/env');
const { decimalToMinor } = require('../modules/billing/pricing/pricing.service');
const { applySuccessfulPayment } = require('../modules/billing/payments/payment-capture.service');
const { processStripeEvent } = require('../modules/billing/payments/stripe-webhook.service');
const { logError } = require('../modules/observability/safe-log');

const getOwnedBooking = async (bookingId, userId) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: true,
      professional: { include: { user: true } },
      payment: true,
    },
  });

  if (!booking) {
    const error = new Error('Reserva no encontrada');
    error.status = 404;
    throw error;
  }
  if (booking.client.userId !== userId) {
    const error = new Error('No tienes permiso para pagar esta reserva');
    error.status = 403;
    throw error;
  }
  return booking;
};

exports.createPaymentIntent = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId es obligatorio' });
    }

    const booking = await getOwnedBooking(bookingId, req.user.id);
    const amountMinor = decimalToMinor(booking.totalPrice);
    if (amountMinor < 100) {
      return res.status(400).json({ success: false, message: 'El importe de la reserva no es válido' });
    }
    const currency = String(booking.currency || STRIPE_CURRENCY).toLowerCase();
    if (booking.payment?.status === 'COMPLETED') {
      return res.status(409).json({ success: false, message: 'La reserva ya está pagada' });
    }

    let paymentIntent = null;
    let previousIntentId = null;
    if (booking.payment?.transactionId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(booking.payment.transactionId);
        previousIntentId = existing.id;
        if (existing.status !== 'canceled') {
          if (existing.amount !== amountMinor || existing.currency !== currency) {
            const mismatch = new Error('La reserva cambió después de crear la intención de pago');
            mismatch.status = 409;
            throw mismatch;
          }
          paymentIntent = existing;
        }
      } catch (error) {
        if (error.code !== 'resource_missing') throw error;
        previousIntentId = booking.payment.transactionId;
      }
    }

    if (!paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountMinor,
        currency,
        metadata: {
          bookingId: booking.id,
          userId: req.user.id,
          professionalId: booking.professionalId || '',
        },
        automatic_payment_methods: { enabled: true },
      }, {
        idempotencyKey: `booking:${booking.id}:payment-intent:${previousIntentId || 'initial'}`,
      });
    }

    await prisma.payment.upsert({
      where: { bookingId: booking.id },
      update: {
        amount: (amountMinor / 100).toFixed(2),
        currency: paymentIntent.currency.toUpperCase(),
        status: 'PROCESSING',
        method: 'STRIPE',
        transactionId: paymentIntent.id,
        failedReason: null,
      },
      create: {
        bookingId: booking.id,
        amount: (amountMinor / 100).toFixed(2),
        currency: paymentIntent.currency.toUpperCase(),
        status: 'PROCESSING',
        method: 'STRIPE',
        transactionId: paymentIntent.id,
      },
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    logError(req, error, 'Payment intent creation failed');
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Error procesando el pago',
    });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, bookingId } = req.body;
    if (!paymentIntentId || !bookingId) {
      return res.status(400).json({ success: false, message: 'Datos de pago incompletos' });
    }

    const booking = await getOwnedBooking(bookingId, req.user.id);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      paymentIntent.metadata.bookingId !== booking.id ||
      paymentIntent.metadata.userId !== req.user.id ||
      booking.payment?.transactionId !== paymentIntent.id
    ) {
      return res.status(403).json({ success: false, message: 'El pago no pertenece a esta reserva' });
    }
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `El pago todavía no se ha completado (${paymentIntent.status})`,
      });
    }

    const result = await prisma.$transaction((tx) => applySuccessfulPayment({
      tx,
      bookingId: booking.id,
      providerTransactionId: paymentIntent.id,
      providerChargeId: typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id,
      providerAmountMinor: paymentIntent.amount_received || paymentIntent.amount,
      providerCurrency: paymentIntent.currency,
      source: 'PAYMENT_CONFIRM_API',
      ledgerEnabled: env.financialLedgerDualWriteEnabled,
      requestContext: req.context,
    }));

    res.json({
      success: true,
      payment: result.payment,
      booking: result.booking,
      duplicate: result.duplicate,
      message: 'Pago confirmado exitosamente',
    });
  } catch (error) {
    logError(req, error, 'Payment confirmation failed');
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Error confirmando el pago',
    });
  }
};

exports.confirmCashPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId es obligatorio' });
    }
    const booking = await getOwnedBooking(bookingId, req.user.id);
    const amount = Number(booking.totalPrice);
    const [payment, updatedBooking] = await prisma.$transaction([
      prisma.payment.upsert({
        where: { bookingId },
        update: { amount, currency: STRIPE_CURRENCY.toUpperCase(), status: 'PENDING', method: 'CASH' },
        create: { bookingId, amount, currency: STRIPE_CURRENCY.toUpperCase(), status: 'PENDING', method: 'CASH' },
      }),
      prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } }),
    ]);
    res.json({ success: true, payment, booking: updatedBooking });
  } catch (error) {
    logError(req, error, 'Cash payment confirmation failed');
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Error confirmando pago en efectivo',
    });
  }
};

exports.stripeWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET_CURRENT || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook de Stripe no configurado' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    logError(req, error, 'Stripe webhook signature verification failed');
    return res.status(400).send('Firma de webhook no válida');
  }

  try {
    const result = await processStripeEvent({
      event,
      requestContext: req.context,
    }, undefined, stripe);
    res.json({ received: true, duplicate: result.duplicate, status: result.status });
  } catch (error) {
    req.log?.error({ err: error, stripeEventId: event.id }, 'Stripe webhook processing failed');
    res.status(500).json({ error: 'No se pudo procesar el webhook' });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const parsedPage = Math.max(1, parseInt(req.query.page || 1));
    const parsedLimit = Math.min(50, Math.max(1, parseInt(req.query.limit || 10)));
    const where = { booking: { client: { userId: req.user.id } } };
    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include: {
          booking: {
            include: {
              professional: { include: { user: true } },
              bookingServices: { include: { service: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
      }),
      prisma.payment.count({ where }),
    ]);
    res.json({
      success: true,
      payments,
      pagination: { page: parsedPage, limit: parsedLimit, total, pages: Math.ceil(total / parsedLimit) },
    });
  } catch (error) {
    logError(req, error, 'Payment history query failed');
    res.status(500).json({ success: false, message: 'Error obteniendo historial de pagos' });
  }
};
