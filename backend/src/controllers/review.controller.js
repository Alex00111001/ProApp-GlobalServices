const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');

/**
 * Obtener reviews de un profesional
 */
exports.getProfessionalReviews = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    const whereClause = {
      professionalId,
      ...(rating ? { rating: parseInt(rating) } : {})
    };

    const reviews = await prisma.review.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        },
        booking: {
          select: {
            id: true,
            service: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.review.count({
      where: whereClause
    });

    const averageRating = await prisma.review.aggregate({
      where: { professionalId },
      _avg: { rating: true }
    });

    res.json({
      success: true,
      reviews,
      averageRating: averageRating._avg.rating || 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logError(req, error, 'Review query failed');
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo reviews',
      error: error.message 
    });
  }
};

/**
 * Crear una review para un profesional
 */
exports.createReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionalId, bookingId, rating, comment, serviceQuality, punctuality, professionalism } = req.body;

    // Validaciones
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'El rating debe ser entre 1 y 5' 
      });
    }

    // Verificar que el booking existe y pertenece al usuario
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professional: true }
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
        message: 'No tienes permiso para revisar esta reserva' 
      });
    }

    if (booking.professionalId !== professionalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'El profesional no corresponde a esta reserva' 
      });
    }

    // Verificar si ya existe una review para este booking
    const existingReview = await prisma.review.findFirst({
      where: { bookingId }
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ya has dejado una review para esta reserva' 
      });
    }

    // Crear la review
    const review = await prisma.review.create({
      data: {
        userId,
        professionalId,
        bookingId,
        rating,
        comment,
        serviceQuality,
        punctuality,
        professionalism
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        }
      }
    });

    // Actualizar el rating promedio del profesional
    const stats = await prisma.review.aggregate({
      where: { professionalId },
      _avg: { rating: true },
      _count: { id: true }
    });

    await prisma.professional.update({
      where: { id: professionalId },
      data: {
        rating: stats._avg.rating || 0,
        reviewCount: stats._count.id
      }
    });

    // Crear notificación para el profesional
    await prisma.notification.create({
      data: {
        userId: professionalId,
        type: 'NEW_REVIEW',
        title: '¡Nueva review recibida!',
        message: `Has recibido una nueva review de ${rating} estrellas`,
        bookingId,
        isRead: false
      }
    });

    res.json({
      success: true,
      message: 'Review creada exitosamente',
      review
    });

  } catch (error) {
    logError(req, error, 'Review creation failed');
    res.status(500).json({ 
      success: false, 
      message: 'Error creando review',
      error: error.message 
    });
  }
};

/**
 * Responder a una review (solo el profesional)
 */
exports.respondToReview = async (req, res) => {
  try {
    const professionalId = req.user.id; // El usuario autenticado es el profesional
    const { reviewId } = req.params;
    const { response } = req.body;

    if (!response || response.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'La respuesta no puede estar vacía' 
      });
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { professional: true }
    });

    if (!review) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review no encontrada' 
      });
    }

    if (review.professionalId !== professionalId) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permiso para responder a esta review' 
      });
    }

    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: { professionalResponse: response, respondedAt: new Date() }
    });

    // Crear notificación para el usuario que dejó la review
    await prisma.notification.create({
      data: {
        userId: review.userId,
        type: 'REVIEW_RESPONSE',
        title: 'El profesional respondió a tu review',
        message: `${review.professional.firstName} ha respondido a tu comentario`,
        isRead: false
      }
    });

    res.json({
      success: true,
      message: 'Respuesta agregada exitosamente',
      review: updatedReview
    });

  } catch (error) {
    logError(req, error, 'Review response failed');
    res.status(500).json({ 
      success: false, 
      message: 'Error respondiendo review',
      error: error.message 
    });
  }
};

/**
 * Obtener mis reviews como profesional
 */
exports.getMyReviews = async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { page = 1, limit = 10, rating } = req.query;

    const whereClause = {
      professionalId,
      ...(rating ? { rating: parseInt(rating) } : {})
    };

    const reviews = await prisma.review.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        },
        booking: {
          select: {
            id: true,
            service: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.review.count({
      where: { professionalId }
    });

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logError(req, error, 'Owned review query failed');
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo reviews',
      error: error.message 
    });
  }
};
