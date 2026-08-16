const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../lib/prisma');

/**
 * Crear una intención de pago con Stripe
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'usd', bookingId } = req.body;
    const userId = req.user.id;

    if (!amount || amount < 100) {
      return res.status(400).json({ 
        success: false, 
        message: 'El monto mínimo es $1.00' 
      });
    }

    // Verificar que el booking existe y pertenece al usuario
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        professional: true,
        service: true
      }
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Reserva no encontrada' 
      });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permiso para pagar esta reserva' 
      });
    }

    // Crear PaymentIntent en Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe usa centavos
      currency,
      metadata: {
        bookingId,
        userId,
        professionalId: booking.professionalId,
        serviceId: booking.serviceId
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Actualizar el booking con el paymentIntentId
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentIntentId: paymentIntent.id,
        status: 'PENDING_PAYMENT'
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

  } catch (error) {
    console.error('Error creando PaymentIntent:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error procesando el pago',
      error: error.message 
    });
  }
};

/**
 * Confirmar un pago después de que Stripe lo procesa
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, bookingId } = req.body;
    const userId = req.user.id;

    // Verificar el estado del PaymentIntent en Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        success: false, 
        message: `El pago no fue exitoso. Estado: ${paymentIntent.status}` 
      });
    }

    // Actualizar el booking a CONFIRMED
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        paidAt: new Date(),
        paymentStatus: 'PAID'
      },
      include: {
        professional: true,
        service: true,
        user: true
      }
    });

    // Crear notificación para el profesional
    await prisma.notification.create({
      data: {
        userId: updatedBooking.professionalId,
        type: 'NEW_BOOKING',
        title: '¡Nueva reserva confirmada!',
        message: `Tienes una nueva reserva de ${updatedBooking.user.name} para ${updatedBooking.service.name}`,
        bookingId: updatedBooking.id,
        isRead: false
      }
    });

    res.json({
      success: true,
      booking: updatedBooking,
      message: 'Pago confirmado exitosamente'
    });

  } catch (error) {
    console.error('Error confirmando pago:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error confirmando el pago',
      error: error.message 
    });
  }
};

/**
 * Webhook para recibir eventos de Stripe
 */
exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar diferentes tipos de eventos
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent fue exitoso:', paymentIntent.id);
      
      // Actualizar booking si es necesario
      if (paymentIntent.metadata.bookingId) {
        await prisma.booking.update({
          where: { id: paymentIntent.metadata.bookingId },
          data: {
            status: 'CONFIRMED',
            paidAt: new Date(),
            paymentStatus: 'PAID'
          }
        });
      }
      break;

    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      console.log('PaymentIntent falló:', failedIntent.id);
      
      if (failedIntent.metadata.bookingId) {
        await prisma.booking.update({
          where: { id: failedIntent.metadata.bookingId },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'FAILED'
          }
        });
      }
      break;

    default:
      console.log(`Evento no manejado: ${event.type}`);
  }

  res.json({ received: true });
};

/**
 * Obtener historial de pagos del usuario
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const payments = await prisma.booking.findMany({
      where: {
        userId,
        paymentStatus: 'PAID'
      },
      include: {
        professional: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            price: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });

    const total = await prisma.booking.count({
      where: {
        userId,
        paymentStatus: 'PAID'
      }
    });

    res.json({
      success: true,
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de pagos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo historial de pagos',
      error: error.message 
    });
  }
};
