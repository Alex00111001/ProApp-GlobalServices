const prisma = require('../config/prisma');

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
    } = req.body;

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
    let totalPrice = 0;
    const platformFeePercentage = 0.15; // 15% de comisión

    for (const serviceItem of bookingServices) {
      const service = servicesById.get(serviceItem.serviceId);
      if (!Number.isInteger(serviceItem.quantity) || serviceItem.quantity < 1) {
        return res.status(400).json({ error: 'Service quantity must be a positive integer' });
      }

      const subtotal = service.basePrice * serviceItem.quantity;
      totalPrice += subtotal;
    }

    const platformFee = totalPrice * platformFeePercentage;
    const professionalEarnings = totalPrice - platformFee;

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
          totalPrice,
          platformFee,
          professionalEarnings,
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
            subtotal: service.basePrice * serviceItem.quantity,
          },
        });
      }

      // Actualizar contadores del cliente
      await tx.clientProfile.update({
        where: { id: req.user.clientProfile?.id },
        data: {
          totalBookings: { increment: 1 },
          totalSpent: { increment: totalPrice },
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

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Determinar quién cancela
    let cancelledBy;
    if (req.user.role === 'CLIENT' && booking.clientId === req.user.clientProfile?.id) {
      cancelledBy = 'CLIENT';
    } else if (req.user.role === 'PROFESSIONAL' && booking.professionalId === req.user.professionalProfile?.id) {
      cancelledBy = 'PROFESSIONAL';
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledBy,
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
    });

    // Crear notificación
    const notifyUserId = cancelledBy === 'CLIENT' 
      ? (await prisma.professionalProfile.findUnique({ 
          where: { id: booking.professionalId } 
        })).userId
      : (await prisma.clientProfile.findUnique({ 
          where: { id: booking.clientId } 
        })).userId;

    await prisma.notification.create({
      data: {
        userId: notifyUserId,
        bookingId: id,
        type: 'BOOKING_CANCELLED',
        title: 'Reserva Cancelada',
        message: `La reserva ha sido cancelada. Razón: ${reason || 'Sin especificar'}`,
      },
    });

    res.json({
      message: 'Booking cancelled successfully',
      booking: updated,
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    if (booking.status !== 'CONFIRMED' && booking.status !== 'IN_PROGRESS') {
      return res.status(400).json({ 
        error: 'Booking cannot be completed from current status' 
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Actualizar estado de la reserva
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: { 
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Actualizar earnings del profesional
      await tx.earning.create({
        data: {
          professionalId: booking.professionalId,
          bookingId: id,
          amount: booking.totalPrice,
          platformFee: booking.platformFee,
          netAmount: booking.professionalEarnings,
          status: 'PENDING',
        },
      });

      // Actualizar estadísticas del profesional
      await tx.professionalProfile.update({
        where: { id: booking.professionalId },
        data: {
          totalBookings: { increment: 1 },
          totalEarnings: { increment: booking.professionalEarnings },
        },
      });

      return tx.booking.findUnique({
        where: { id },
        include: {
          client: { include: { user: true } },
          professional: { include: { user: true } },
        },
      });
    });

    // Crear notificación para el cliente
    await prisma.notification.create({
      data: {
        userId: booking.clientId,
        bookingId: id,
        type: 'BOOKING_CONFIRMED',
        title: 'Servicio Completado',
        message: 'El servicio ha sido completado. ¡Por favor deja tu reseña!',
      },
    });

    res.json({
      message: 'Booking completed successfully',
      booking: updated,
    });
  } catch (error) {
    console.error('Complete booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
