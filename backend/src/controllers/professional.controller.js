const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');
const { z } = require('zod');
const { professionalProfileSchema } = require('../validators/auth.validators');

const listQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  city: z.string().trim().min(2).max(120).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.enum(['averageRating', 'totalReviews', 'hourlyRate', 'createdAt']).default('averageRating'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();
const uuid = z.string().uuid();

const publicReviewSelect = {
  id: true,
  rating: true,
  comment: true,
  response: true,
  responseAt: true,
  createdAt: true,
  client: { select: { firstName: true, lastName: true, avatarUrl: true } },
};

// Obtener profesionales con filtros y búsqueda
exports.getProfessionals = async (req, res, next) => {
  try {
    const { categoryId, city, minRating, page, limit, sortBy, sortOrder } = listQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      status: 'APPROVED',
      user: { isActive: true },
    };

    if (categoryId) {
      where.categories = {
        some: { categoryId },
      };
    }

    if (city) {
      where.serviceAreas = {
        some: {
          lifecycle: 'ACTIVE',
          division: { canonicalName: { contains: city, mode: 'insensitive' } },
        },
      };
    }

    if (minRating) {
      where.averageRating = { gte: parseFloat(minRating) };
    }

    const professionals = await prisma.professionalProfile.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            reviewsReceived: {
              where: { isVisible: true },
              take: 3,
              orderBy: { createdAt: 'desc' },
              select: publicReviewSelect,
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
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    logError(req, error, 'Professional list query failed');
    next(error);
  }
};

// Obtener un profesional por ID
exports.getProfessionalById = async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);

    const professional = await prisma.professionalProfile.findUnique({
      where: { id, status: 'APPROVED', user: { isActive: true } },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            reviewsReceived: {
              where: { isVisible: true },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: publicReviewSelect,
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
      },
    });

    if (!professional) {
      return res.status(404).json({ error: 'Professional not found' });
    }

    res.json({ professional });
  } catch (error) {
    logError(req, error, 'Professional lookup failed');
    next(error);
  }
};

// Actualizar perfil de profesional
exports.updateProfessionalProfile = async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id);
    const input = professionalProfileSchema.strict().parse(req.body);
    const professional = await prisma.professionalProfile.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true },
    });
    if (!professional) return res.status(404).json({ error: 'Professional profile not found' });
    const { categoryIds, ...profileData } = input;

    const updated = await prisma.$transaction(async (tx) => {
      if (categoryIds !== undefined) {
        const categoryCount = await tx.category.count({ where: { id: { in: categoryIds }, isActive: true } });
        if (categoryCount !== new Set(categoryIds).size) {
          throw Object.assign(new Error('One or more categories are invalid.'), { statusCode: 400, code: 'CATEGORY_INVALID' });
        }
        await tx.professionalCategory.deleteMany({ where: { professionalId: id, categoryId: { notIn: categoryIds } } });
        for (const categoryId of new Set(categoryIds)) {
          await tx.professionalCategory.upsert({
            where: { professionalId_categoryId: { professionalId: id, categoryId } },
            update: {},
            create: { professionalId: id, categoryId },
          });
        }
      }
      return tx.professionalProfile.update({
        where: { id },
        data: profileData,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        categories: { include: { category: true } },
      },
      });
    });

    res.json({
      message: 'Professional profile updated successfully',
      professional: updated,
    });
  } catch (error) {
    logError(req, error, 'Professional update failed');
    next(error);
  }
};

module.exports = exports;
