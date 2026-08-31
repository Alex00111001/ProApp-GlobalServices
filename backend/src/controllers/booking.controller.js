const prisma = require('../config/prisma');
const { normalizeBookingPayload } = require('../shared/http/compatibility');
const { CLIENT_PLATFORM_FEE_PERCENTAGE, PROFESSIONAL_COMMISSION_PERCENTAGE, PAYMENT_CURRENCY } = require('../config/business');
const { createBookingSchema } = require('../validators/auth.validators');
const { calculateQuote, decimalToMinor } = require('../modules/billing/pricing/pricing.service');
const env = require('../config/env');
const { createPayoutRequestForCompletedBookingInTx } = require('../modules/billing/payouts/payout-request.service');
const { createCancellationRefundRequestInTx } = require('../modules/billing/refunds/refund-request.service');

// Crear reserva
exports.createBooking = async (req, res) => {
  try {
    const { 
      professionalId, 
      scheduledDate, 
      address, 
      city, 
      state, 
      postalCode,
      latitude,
      longitude,
      notes,
      services: bookingServices 
    } = createBookingSchema.parse(normalizeBookingPayload(req.body));

    // Verificar que el profesional existe y está aprobado
    const professional = await prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      include: { services: true, categories: true },
    });

    if (!professional || professional.status !== 'APPROVED') {
      return res.status(400).json({ 
        error: 'Professional not found or not approved' 
      });
    }

    if (!Array.isArray(bookingServices) || bookingServices.length === 0) {
      return res.status(400).json({ error: 'At least one service is required' });
    }

    const requestedServiceIds = [...new Set(bookingServices.map((item) => item.serviceId))];
    const services = await prisma.service.findMany({
      where: {
        id: { in: requestedServiceIds },
        professionalId,
        categoryId: { in: professional.categories.map((item) => item.categoryId) },
        isActive: true,
      },
    });
    const servicesById = new Map(services.map((service) => [service.id, service]));

    if (services.length !== requestedServiceIds.length) {
      return res.status(400).json({
        error: 'One or more services do not belong to the selected professional or category',
      });
    }

    // Calcular precios exclusivamente con servicios del profesional y su categoría.
    let serviceAmountMinor = 0;

    for (const serviceItem of bookingServices) {
      const service = servicesById.get(serviceItem.serviceId);
      if (!Number.isInteger(serviceItem.quantity) || serviceItem.quantity < 1) {
        return res.status(400).json({ error: 'Service quantity must be a positive integer' });
      }

      serviceAmountMinor += decimalToMinor(service.basePrice) * serviceItem.quantity;
    }

    const quote = calculateQuote({
      serviceAmountMinor,
      platformFeeBasisPoints: Math.round(CLIENT_PLATFORM_FEE_PERCENTAGE * 10_000),
      commissionBasisPoints: Math.round(PROFESSIONAL_COMMISSION_PERCENTAGE * 10_000),
      currency: PAYMENT_CURRENCY.toUpperCase(),
    });
    const money = (minor) => (minor / 100).toFixed(2);

    // Crear reserva con transacción
    const booking = await prisma.$transaction(async (tx) => {
      // Crear la reserva
      const newBooking = await tx.booking.create({
        data: {
          clientId: req.user.clientProfile?.id,
          professionalId,
          scheduledDate: new Date(scheduledDate),
          address,
          city,
          state,
          postalCode,
          latitude,
          longitude,
          notes,
          totalPrice: money(quote.customerTotalMinor),
          serviceAmount: money(quote.serviceAmountMinor),
          platformFee: money(quote.platformFeeMinor),
          professionalCommission: money(quote.professionalCommissionMinor),
          professionalEarnings: money(quote.professionalPayoutMinor),
          currency: quote.currency,
          pricingSnapshot: quote,
          status: 'PENDING',
        },
      });

      // Crear los servicios de la reserva
      for (const serviceItem of bookingServices) {
        const service = servicesById.get(serviceItem.serviceId);

        await tx.bookingService.create({
          data: {
            bookingId: newBooking.id,
            serviceId: serviceItem.serviceId,
            quantity: serviceItem.quantity,
            price: service.basePrice,
            subtotal: money(decimalToMinor(service.basePrice) * serviceItem.quantity),
          },
        });
      }

      // Actualizar contadores del cliente
      await tx.clientProfile.update({
        where: { id: req.user.clientProfile?.id },
        data: {
          totalBookings: { increment: 1 },
          totalSpent: { increment: money(quote.customerTotalMinor) },
        },
      });

      // Crear notificación para el profesional
      await tx.notification.create({
        data: {
          userId: professional.userId,
          bookingId: newBooking.id,
          type: 'BOOKING_REQUEST',
          title: 'Nueva Solicitud de Reserva',
          message: `Tienes una nueva solicitud de servicio para el ${new Date(scheduledDate).toLocaleDateString()}`,
        },
      });

      return tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          client: {
            include: { user: true },
          },
          professional: {
            include: { user: true },
          },
          bookingServices: {
            include: { service: true },
          },
        },
      });
    });

    res.status(201).json({
      message: 'Booking created successfully',
      booking,
    });
  } catch (error) {
    console.error('Create booking error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener una reserva concreta, limitada al cliente o profesional propietario.
exports.getBookingById = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        client: { include: { user: true } },
        professional: { include: { user: true } },
        bookingServices: {
          include: { service: { include: { category: true, subcategory: true } } },
        },
        payment: true,
        review: true,
      },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isClient = booking.client?.userId === req.user.id;
    const isProfessional = booking.professional?.userId === req.user.id;
    if (!isClient && !isProfessional) return res.status(403).json({ error: 'Forbidden' });

    res.json({ booking });
  } catch (error) {
    console.error('Get booking by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener reservas del cliente autenticado
exports.getClientBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { clientId: req.user.clientProfile?.id };

    if (status) {
      where.status = status;
    }

    const bookings = await prisma.booking.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: {
        professional: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        bookingServices: {
          include: { service: true },
        },
        payment: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.booking.count({ where });

    res.json({
      bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get client bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener reservas del profesional autenticado
exports.getProfessionalBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { professionalId: req.user.professionalProfile?.id };

    if (status) {
      where.status = status;
    }

    const bookings = await prisma.booking.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: {
        client: {
          include: {
            user: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
        bookingServices: {
          include: { service: true },
        },
        payment: true,
        review: true,
      },
      orderBy: { scheduledDate: 'asc' },
    });

    const total = await prisma.booking.count({ where });

    res.json({
      bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get professional bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Confirmar reserva (profesional)
exports.confirmBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.professionalId !== req.user.professionalProfile?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (booking.status !== 'PENDING') {
      return res.status(400).json({ 
        error: 'Booking cannot be confirmed from current status' 
      });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' },
      include: {
        client: { include: { user: true } },
        professional: { include: { user: true } },
      },
    });

    // Crear notificación para el cliente
    await prisma.notification.create({
      data: {
        userId: booking.clientId,
        bookingId: id,
        type: 'BOOKING_CONFIRMED',
        title: 'Reserva Confirmada',
        message: 'Tu reserva ha sido confirmada por el profesional.',
      },
    });

    res.json({
      message: 'Booking confirmed successfully',
      booking: updated,
    });
  } catch (error) {
    console.error('Confirm booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Cancelar reserva
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const cancellationReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : null;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        client: { select: { userId: true, country: true } },
        professional: { select: { userId: true } },
        payment: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Determinar quién cancela
    let cancelledBy;
    if (req.user.role === 'CLIENT' && booking.client.userId === req.user.id) {
      cancelledBy = 'CLIENT';
    } else if (req.user.role === 'PROFESSIONAL' && booking.professional?.userId === req.user.id) {
      cancelledBy = 'PROFESSIONAL';
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (booking.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Completed bookings cannot be cancelled' });
    }

    const cancelledAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        data: {
          status: 'CANCELLED',
          cancelledBy,
          cancellationReason,
          cancelledAt,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.booking.findUnique({ where: { id } });
        if (current?.status === 'CANCELLED') return { booking: current, refundRequest: null, duplicate: true };
        const error = new Error('Booking can no longer be cancelled');
        error.status = 409;
        throw error;
      }

      const notifyUserId = cancelledBy === 'CLIENT'
        ? booking.professional?.userId
        : booking.client.userId;
      if (notifyUserId) {
        await tx.notification.create({
          data: {
            userId: notifyUserId,
            bookingId: id,
            type: 'BOOKING_CANCELLED',
            title: 'Reserva Cancelada',
            message: `La reserva ha sido cancelada. Razón: ${cancellationReason || 'Sin especificar'}`,
          },
        });
      }

      const refundRequest = env.financialRefundRequestsEnabled
        ? await createCancellationRefundRequestInTx({
          tx,
          booking,
          requestedBy: req.user.id,
          whoCancelled: cancelledBy,
          reason: cancellationReason,
          cancelledAt,
        })
        : null;
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking',
          aggregateId: id,
          eventType: 'booking.cancelled',
          payload: { bookingId: id, cancelledBy },
          metadata: { refundRequestsEnabled: env.financialRefundRequestsEnabled },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'booking.cancelled',
          resourceType: 'Booking',
          resourceId: id,
          outcome: 'SUCCESS',
          before: { status: booking.status },
          after: { status: 'CANCELLED', cancelledBy },
          requestId: req.context?.requestId,
          correlationId: req.context?.correlationId,
          traceId: req.context?.traceId,
        },
      });
      const updated = await tx.booking.findUnique({ where: { id } });
      return { booking: updated, refundRequest, duplicate: false };
    });

    res.json({
      message: 'Booking cancelled successfully',
      booking: result.booking,
      refundRequest: result.refundRequest,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' });
  }
};

// Completar reserva (profesional)
exports.completeBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.professionalId !== req.user.professionalProfile?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) {
      return res.status(400).json({ 
        error: 'Booking cannot be completed from current status' 
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claimed.count === 0) {
        const current = await tx.booking.findUnique({
          where: { id },
          include: { client: true, professional: { include: { user: true } }, payout: true },
        });
        if (current?.status === 'COMPLETED') return { booking: current, payout: current.payout, duplicate: true };
        throw Object.assign(new Error('Booking cannot be completed from current status'), { status: 409 });
      }

      // Actualizar earnings del profesional
      const earning = await tx.earning.create({
        data: {
          professionalId: booking.professionalId,
          bookingId: id,
          amount: booking.pricingSnapshot ? booking.serviceAmount : booking.totalPrice,
          platformFee: booking.pricingSnapshot ? booking.professionalCommission : booking.platformFee,
          netAmount: booking.professionalEarnings,
          status: 'PENDING',
        },
      });

      const payment = await tx.payment.findUnique({ where: { bookingId: id } });
      const payoutRequest = await createPayoutRequestForCompletedBookingInTx({
        tx,
        booking,
        payment,
        earning,
        requestedBy: req.user.id,
        enabled: env.financialPayoutRequestsEnabled,
        requestContext: req.context,
      });

      // Actualizar estadísticas del profesional
      await tx.professionalProfile.update({
        where: { id: booking.professionalId },
        data: {
          totalBookings: { increment: 1 },
          totalEarnings: { increment: booking.professionalEarnings },
        },
      });

      const completedBooking = await tx.booking.findUnique({
        where: { id },
        include: {
          client: { include: { user: true } },
          professional: { include: { user: true } },
          payout: true,
        },
      });

      await tx.notification.create({
        data: {
          userId: completedBooking.client.userId,
          bookingId: id,
          type: 'BOOKING_CONFIRMED',
          title: 'Servicio Completado',
          message: 'El servicio ha sido completado. ¡Por favor deja tu reseña!',
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking',
          aggregateId: id,
          eventType: 'booking.completed',
          payload: { bookingId: id, professionalId: booking.professionalId },
          metadata: { payoutRequestsEnabled: env.financialPayoutRequestsEnabled },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'booking.completed',
          resourceType: 'Booking',
          resourceId: id,
          outcome: 'SUCCESS',
          before: { status: booking.status },
          after: { status: 'COMPLETED' },
          requestId: req.context?.requestId,
          correlationId: req.context?.correlationId,
          traceId: req.context?.traceId,
        },
      });
      return { booking: completedBooking, payout: payoutRequest.payout, duplicate: false };
    });

    res.json({
      message: 'Booking completed successfully',
      booking: result.booking,
      payout: result.payout,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error('Complete booking error:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' });
  }
};

module.exports = exports;
