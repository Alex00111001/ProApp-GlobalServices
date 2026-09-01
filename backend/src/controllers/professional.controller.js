const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');

// Obtener profesionales con filtros y búsqueda
exports.getProfessionals = async (req, res) => {
  try {
    const { 
      categoryId, 
      city, 
      minRating, 
      page = 1, 
      limit = 10,
      sortBy = 'averageRating',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      status: 'APPROVED',
    };

    if (categoryId) {
      where.categories = {
        some: { categoryId },
      };
    }

    if (city) {
      where.user = {
        clientProfile: {
          city: { contains: city, mode: 'insensitive' },
        },
      };
    }

    if (minRating) {
      where.averageRating = { gte: parseFloat(minRating) };
    }

    const professionals = await prisma.professionalProfile.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phone: true,
            reviewsReceived: {
              take: 3,
              orderBy: { createdAt: 'desc' },
              include: {
                client: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
        categories: {
          include: { category: true },
        },
        services: {
          where: { isActive: true },
          take: 5,
        },
        portfolio: {
          take: 3,
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { [sortBy]: sortOrder },
    });

    const total = await prisma.professionalProfile.count({ where });

    res.json({
      professionals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    logError(req, error, 'Professional list query failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener un profesional por ID
exports.getProfessionalById = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await prisma.professionalProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phone: true,
            email: true,
            reviewsReceived: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              include: {
                client: {
                  select: { firstName: true, lastName: true, avatarUrl: true },
                },
              },
            },
          },
        },
        categories: {
          include: { category: true },
        },
        services: {
          where: { isActive: true },
        },
        portfolio: {
          orderBy: { displayOrder: 'asc' },
        },
        certifications: {
          where: { verified: true },
        },
        availability: {
          orderBy: { dayOfWeek: 'asc' },
        },
        earnings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!professional) {
      return res.status(404).json({ error: 'Professional not found' });
    }

    // Verificar si el profesional está aprobado
    if (professional.status !== 'APPROVED') {
      return res.status(403).json({ 
        error: 'Professional profile is not approved yet' 
      });
    }

    res.json({ professional });
  } catch (error) {
    logError(req, error, 'Professional lookup failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Actualizar perfil de profesional
exports.updateProfessionalProfile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar permisos
    if (req.user.role !== 'ADMIN') {
      const professional = await prisma.professionalProfile.findUnique({
        where: { id },
      });

      if (!professional) {
        return res.status(404).json({ error: 'Professional profile not found' });
      }
      if (professional.userId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const { 
      bio, 
      yearsOfExperience, 
      hourlyRate, 
      serviceRadius,
      latitude,
      longitude,
    } = req.body;

    const updated = await prisma.professionalProfile.update({
      where: { id },
      data: {
        bio,
        yearsOfExperience,
        hourlyRate,
        serviceRadius,
        latitude,
        longitude,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      message: 'Professional profile updated successfully',
      professional: updated,
    });
  } catch (error) {
    logError(req, error, 'Professional update failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Aprobar profesional (solo admin)
exports.approveProfessional = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await prisma.professionalProfile.update({
      where: { id },
      data: {
        status: 'APPROVED',
        verifiedAt: new Date(),
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Crear notificación para el profesional
    await prisma.notification.create({
      data: {
        userId: professional.userId,
        type: 'SYSTEM',
        title: '¡Perfil Aprobado!',
        message: `Tu perfil ha sido aprobado. ¡Ya puedes comenzar a recibir reservas!`,
      },
    });

    res.json({
      message: 'Professional approved successfully',
      professional,
    });
  } catch (error) {
    logError(req, error, 'Professional approval failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Rechazar profesional (solo admin)
exports.rejectProfessional = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const professional = await prisma.professionalProfile.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedReason: reason || 'No cumple con los requisitos',
      },
    });

    // Crear notificación para el profesional
    await prisma.notification.create({
      data: {
        userId: professional.userId,
        type: 'SYSTEM',
        title: 'Perfil Rechazado',
        message: `Tu perfil ha sido rechazado. Razón: ${reason || 'No cumple con los requisitos'}`,
      },
    });

    res.json({
      message: 'Professional rejected',
      professional,
    });
  } catch (error) {
    logError(req, error, 'Professional rejection failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
