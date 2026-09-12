const prisma = require('../config/prisma');
const { normalizeBookingPayload } = require('../shared/http/compatibility');
const { createBookingSchema } = require('../validators/auth.validators');
const { calculateQuote, decimalToMinor } = require('../modules/billing/pricing/pricing.service');
const env = require('../config/env');
const { telemetryMetadata } = require('../modules/observability/context');
const { logError } = require('../modules/observability/safe-log');
const { createPayoutRequestForCompletedBookingInTx } = require('../modules/billing/payouts/payout-request.service');
const { createCancellationRefundRequestInTx } = require('../modules/billing/refunds/refund-request.service');
const {
  claimBookingCreation,
  completeBookingCreation,
  findCompletedBookingCreation,
  parseIdempotencyKey,
  requestDigest,
  schedulingWindow,
} = require('../modules/bookings/booking-creation.service');
const { resolveBookingCommercialPolicy } = require('../modules/bookings/booking-commercial-policy.service');
const { assertBookingPaymentSettled, claimBookingTransition } = require('../modules/bookings/booking-lifecycle.service');
const { BOOKING_READ_INCLUDE } = require('../shared/http/public-projections');

// Crear reserva
exports.createBooking = async (req, res) => {
  try {
    const { 
      professionalId, 
      addressId,
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
      include: { services: true, categories: true, user: { select: { marketId: true } } },
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

    const idempotencyKey = parseIdempotencyKey(req.get('idempotency-key'));
    const window = schedulingWindow({
      scheduledDate,
      bookingServices,
      servicesById,
    });

    const creationRequestHash = requestDigest({
      actorUserId: req.user.id,
      professionalId,
      addressId: addressId || null,
      scheduledDate: window.start.toISOString(),
      address,
      city,
      state,
      postalCode,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      notes: notes || null,
      services: bookingServices,
    });
    const replayBookingId = await findCompletedBookingCreation({
      client: prisma,
      actorUserId: req.user.id,
      idempotencyKey,
      requestHash: creationRequestHash,
    });
    if (replayBookingId) {
      const replayBooking = await prisma.booking.findUnique({ where: { id: replayBookingId }, include: BOOKING_READ_INCLUDE });
      if (!replayBooking) throw Object.assign(new Error('Idempotent booking result was not found.'), { code: 'BOOKING_IDEMPOTENT_RESULT_MISSING', statusCode: 500 });
      return res.status(200).json({ message: 'Booking already created', booking: replayBooking, duplicate: true });
    }

    let normalizedAddress = null;
    if (env.marketsIdentityGeographyEnabled) {
      if (!req.user.marketId || professional.user.marketId !== req.user.marketId || !addressId) return res.status(400).json({ error: 'An owned address in the shared active market is required.', code: 'BOOKING_MARKET_ADDRESS_REQUIRED' });
      normalizedAddress = await prisma.address.findFirst({
        where: { id: addressId, userId: req.user.id, marketId: req.user.marketId, validationStatus: { in: ['FORMAT_VALID', 'VERIFIED'] } },
        include: { divisions: { include: { division: true }, orderBy: { level: 'asc' } } },
      });
      if (!normalizedAddress) return res.status(400).json({ error: 'Booking address is unavailable.', code: 'BOOKING_ADDRESS_INVALID' });
      const covered = await prisma.professionalServiceArea.count({ where: { professionalId, marketId: req.user.marketId, lifecycle: 'ACTIVE', divisionId: { in: normalizedAddress.divisions.map((entry) => entry.divisionId) } } });
      if (covered === 0) return res.status(409).json({ error: 'Professional does not cover this address.', code: 'BOOKING_OUTSIDE_SERVICE_AREA' });
    }

    const commercialPolicy = await resolveBookingCommercialPolicy({
      client: prisma,
      marketId: req.user.marketId,
    });
    const quote = calculateQuote({
      serviceAmountMinor,
      platformFeeBasisPoints: commercialPolicy.platformFeeBasisPoints,
      commissionBasisPoints: commercialPolicy.commissionBasisPoints,
      currency: commercialPolicy.currency,
    });
    const money = (minor) => (minor / 100).toFixed(2);

    // Idempotency and the professional schedule share the same database
    // transaction, so retries and concurrent clients cannot create duplicates.
    const creation = await prisma.$transaction(async (tx) => {
      const claim = await claimBookingCreation({
        tx,
        actorUserId: req.user.id,
        professionalId,
        idempotencyKey,
        requestHash: creationRequestHash,
        start: window.start,
        end: window.end,
        ttlHours: env.bookingIdempotencyTtlHours,
      });
      if (claim.replayBookingId) {
        return { bookingId: claim.replayBookingId, duplicate: true };
      }

      // Crear la reserva
      const newBooking = await tx.booking.create({
        data: {
          clientId: req.user.clientProfile?.id,
          professionalId,
          marketId: req.user.marketId || undefined,
          addressId: normalizedAddress?.id,
          scheduledDate: window.start,
          endDate: window.end,
          address: normalizedAddress?.line1 || address,
          city: normalizedAddress?.locality || normalizedAddress?.divisions.at(-1)?.division.canonicalName || city,
          state: normalizedAddress?.divisions[0]?.division.canonicalName || state,
          postalCode: normalizedAddress?.postalCode || postalCode,
          latitude: normalizedAddress?.latitude ?? latitude,
          longitude: normalizedAddress?.longitude ?? longitude,
          notes,
          totalPrice: money(quote.customerTotalMinor),
          serviceAmount: money(quote.serviceAmountMinor),
          platformFee: money(quote.platformFeeMinor),
          professionalCommission: money(quote.professionalCommissionMinor),
          professionalEarnings: money(quote.professionalPayoutMinor),
          currency: quote.currency,
          pricingPolicyId: commercialPolicy.pricingPolicyId || undefined,
          pricingSnapshot: { ...commercialPolicy.snapshot, quote },
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

      await completeBookingCreation({
        tx,
        actorUserId: req.user.id,
        idempotencyKey,
        bookingId: newBooking.id,
      });

      return { bookingId: newBooking.id, duplicate: false };
    });

    const booking = await prisma.booking.findUnique({
      where: { id: creation.bookingId },
      include: BOOKING_READ_INCLUDE,
    });
    if (!booking) {
      throw Object.assign(new Error('Idempotent booking result was not found.'), {
        code: 'BOOKING_IDEMPOTENT_RESULT_MISSING',
        statusCode: 500,
      });
    }

    res.status(creation.duplicate ? 200 : 201).json({
      message: 'Booking created successfully',
      booking,
      duplicate: creation.duplicate,
    });
  } catch (error) {
    logError(req, error, 'Booking creation failed');
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    if (error.statusCode || error.status) {
      return res.status(error.statusCode || error.status).json({
        error: error.message,
        code: error.code,
        correlationId: req.context?.correlationId,
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener una reserva concreta, limitada al cliente o profesional propietario.
exports.getBookingById = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: BOOKING_READ_INCLUDE,
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isClient = booking.client?.userId === req.user.id;
    const isProfessional = booking.professional?.userId === req.user.id;
    if (!isClient && !isProfessional) return res.status(403).json({ error: 'Forbidden' });

    res.json({ booking });
  } catch (error) {
    logError(req, error, 'Booking lookup failed');
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
      include: BOOKING_READ_INCLUDE,
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
    logError(req, error, 'Client booking query failed');
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
      include: BOOKING_READ_INCLUDE,
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
    logError(req, error, 'Professional booking query failed');
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

    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return res.status(409).json({
        error: 'Booking cannot be confirmed from current status',
        code: 'BOOKING_TRANSITION_CONFLICT',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const transition = await claimBookingTransition({ tx, bookingId: id, transition: 'CONFIRM', include: BOOKING_READ_INCLUDE });
      if (transition.duplicate) return transition;
      const confirmed = transition.booking;
      await tx.notification.create({
        data: {
          userId: confirmed.client.userId,
          bookingId: id,
          type: 'BOOKING_CONFIRMED',
          title: 'Reserva Confirmada',
          message: 'Tu reserva ha sido confirmada por el profesional.',
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking', aggregateId: id, eventType: 'booking.confirmed',
          payload: { bookingId: id, professionalId: booking.professionalId },
          metadata: telemetryMetadata(req.context),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id, action: 'booking.confirmed', resourceType: 'Booking', resourceId: id,
          outcome: 'SUCCESS', before: { status: transition.from }, after: { status: transition.to },
          requestId: req.context?.requestId, correlationId: req.context?.correlationId, traceId: req.context?.traceId,
        },
      });
      return transition;
    });

    res.json({
      message: 'Booking confirmed successfully',
      booking: result.booking,
      duplicate: result.duplicate,
    });
  } catch (error) {
    logError(req, error, 'Booking confirmation failed');
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Internal server error',
      code: error.statusCode ? error.code : undefined,
      correlationId: req.context?.correlationId,
    });
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
        market: { select: { country: { select: { isoAlpha2: true } } } },
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
          requestContext: req.context,
        })
        : null;
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking',
          aggregateId: id,
          eventType: 'booking.cancelled',
          payload: { bookingId: id, cancelledBy },
          metadata: telemetryMetadata(req.context, { refundRequestsEnabled: env.financialRefundRequestsEnabled }),
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
    logError(req, error, 'Booking cancellation failed');
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' });
  }
};

// Rechazar solicitud pendiente (profesional)
exports.rejectBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.professionalId !== req.user.professionalProfile?.id) return res.status(403).json({ error: 'Forbidden' });
    if (!['PENDING', 'CANCELLED'].includes(booking.status)) {
      return res.status(409).json({ error: 'Booking cannot be rejected from current status', code: 'BOOKING_TRANSITION_CONFLICT' });
    }

    const rejectedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const transition = await claimBookingTransition({
        tx,
        bookingId: id,
        transition: 'REJECT',
        data: { cancelledBy: 'PROFESSIONAL', cancellationReason: reason || 'Professional declined request', cancelledAt: rejectedAt },
        include: BOOKING_READ_INCLUDE,
        isDuplicate: (current) => current.cancelledBy === 'PROFESSIONAL',
      });
      if (transition.duplicate) return transition;
      await tx.notification.create({
        data: {
          userId: transition.booking.client.userId,
          bookingId: id,
          type: 'BOOKING_CANCELLED',
          title: 'Solicitud no aceptada',
          message: 'El profesional no ha podido aceptar esta solicitud.',
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking', aggregateId: id, eventType: 'booking.rejected',
          payload: { bookingId: id, professionalId: booking.professionalId },
          metadata: telemetryMetadata(req.context),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id, action: 'booking.rejected', resourceType: 'Booking', resourceId: id,
          outcome: 'SUCCESS', before: { status: transition.from }, after: { status: transition.to, cancelledBy: 'PROFESSIONAL' },
          requestId: req.context?.requestId, correlationId: req.context?.correlationId, traceId: req.context?.traceId,
        },
      });
      return transition;
    });

    res.json({ message: 'Booking rejected successfully', booking: result.booking, duplicate: result.duplicate });
  } catch (error) {
    logError(req, error, 'Booking rejection failed');
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Internal server error',
      code: error.statusCode ? error.code : undefined,
      correlationId: req.context?.correlationId,
    });
  }
};

// Iniciar reserva (profesional)
exports.startBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.professionalId !== req.user.professionalProfile?.id) return res.status(403).json({ error: 'Forbidden' });
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
      return res.status(409).json({ error: 'Booking cannot be started from current status', code: 'BOOKING_TRANSITION_CONFLICT' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const transition = await claimBookingTransition({ tx, bookingId: id, transition: 'START', include: BOOKING_READ_INCLUDE });
      if (transition.duplicate) return transition;
      await tx.notification.create({
        data: {
          userId: transition.booking.client.userId,
          bookingId: id,
          type: 'BOOKING_CONFIRMED',
          title: 'Servicio iniciado',
          message: 'El profesional ha iniciado el servicio.',
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking', aggregateId: id, eventType: 'booking.started',
          payload: { bookingId: id, professionalId: booking.professionalId },
          metadata: telemetryMetadata(req.context),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id, action: 'booking.started', resourceType: 'Booking', resourceId: id,
          outcome: 'SUCCESS', before: { status: transition.from }, after: { status: transition.to },
          requestId: req.context?.requestId, correlationId: req.context?.correlationId, traceId: req.context?.traceId,
        },
      });
      return transition;
    });

    res.json({ message: 'Booking started successfully', booking: result.booking, duplicate: result.duplicate });
  } catch (error) {
    logError(req, error, 'Booking start failed');
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Internal server error',
      code: error.statusCode ? error.code : undefined,
      correlationId: req.context?.correlationId,
    });
  }
};

// Completar reserva (profesional)
exports.completeBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { payment: { select: { id: true, status: true, method: true } } },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.professionalId !== req.user.professionalProfile?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!['IN_PROGRESS', 'COMPLETED'].includes(booking.status)) {
      return res.status(409).json({
        error: 'Booking must be in progress before it can be completed',
        code: 'BOOKING_TRANSITION_CONFLICT',
      });
    }
    assertBookingPaymentSettled(booking.payment);

    const result = await prisma.$transaction(async (tx) => {
      const transition = await claimBookingTransition({
        tx, bookingId: id, transition: 'COMPLETE', data: { completedAt: new Date() }, include: BOOKING_READ_INCLUDE,
      });
      if (transition.duplicate) return { booking: transition.booking, payout: null, duplicate: true };

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
        include: BOOKING_READ_INCLUDE,
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
          metadata: telemetryMetadata(req.context, { payoutRequestsEnabled: env.financialPayoutRequestsEnabled }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'booking.completed',
          resourceType: 'Booking',
          resourceId: id,
          outcome: 'SUCCESS',
          before: { status: transition.from },
          after: { status: 'COMPLETED' },
          requestId: req.context?.requestId,
          correlationId: req.context?.correlationId,
          traceId: req.context?.traceId,
        },
      });
      const payout = payoutRequest.payout ? {
        id: payoutRequest.payout.id,
        status: payoutRequest.payout.status,
        amount: payoutRequest.payout.amount,
        currency: payoutRequest.payout.currency,
        eligibleAt: payoutRequest.payout.eligibleAt,
        approvedAt: payoutRequest.payout.approvedAt,
        processedAt: payoutRequest.payout.processedAt,
      } : null;
      return { booking: completedBooking, payout, duplicate: false };
    });

    res.json({
      message: 'Booking completed successfully',
      booking: result.booking,
      payout: result.payout,
      duplicate: result.duplicate,
    });
  } catch (error) {
    logError(req, error, 'Booking completion failed');
    const status = error.statusCode || error.status;
    res.status(status || 500).json({
      error: status ? error.message : 'Internal server error',
      code: status ? error.code : undefined,
      correlationId: req.context?.correlationId,
    });
  }
};

module.exports = exports;
