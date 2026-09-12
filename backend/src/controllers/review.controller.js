const { Prisma } = require('@prisma/client');
const { z } = require('zod');
const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');
const { reviewSchema } = require('../validators/auth.validators');
const { PUBLIC_USER_SELECT } = require('../shared/http/public-projections');

const uuid = z.string().uuid();
const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
}).strict();
const responseSchema = z.object({ response: z.string().trim().min(1).max(500) }).strict();

const reviewSelect = {
  id: true,
  bookingId: true,
  rating: true,
  comment: true,
  response: true,
  responseAt: true,
  createdAt: true,
  updatedAt: true,
  client: { select: PUBLIC_USER_SELECT },
  booking: {
    select: {
      id: true,
      bookingServices: {
        select: { service: { select: { id: true, name: true } } },
      },
    },
  },
};

const httpError = (statusCode, code, message) => Object.assign(new Error(message), {
  statusCode,
  code,
});

const handleError = (req, next, error, message) => {
  logError(req, error, message);
  next(error);
};

exports.getProfessionalReviews = async (req, res, next) => {
  try {
    const profileId = uuid.parse(req.params.professionalId);
    const query = pageQuerySchema.parse(req.query);
    const profile = await prisma.professionalProfile.findFirst({
      where: { id: profileId, status: 'APPROVED', user: { isActive: true } },
      select: { userId: true },
    });
    if (!profile) throw httpError(404, 'PROFESSIONAL_NOT_FOUND', 'Professional not found.');

    const where = {
      professionalId: profile.userId,
      isVisible: true,
      ...(query.rating ? { rating: query.rating } : {}),
    };
    const [reviews, total, ratingSummary] = await prisma.$transaction([
      prisma.review.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: reviewSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.review.count({ where }),
      prisma.review.aggregate({
        where: { professionalId: profile.userId, isVisible: true },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    res.json({
      success: true,
      reviews,
      averageRating: ratingSummary._avg.rating || 0,
      reviewCount: ratingSummary._count.id,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    handleError(req, next, error, 'Review query failed');
  }
};

exports.createReview = async (req, res, next) => {
  try {
    const input = reviewSchema.strict().parse(req.body);
    const review = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: {
          id: true,
          status: true,
          client: { select: { userId: true } },
          professional: { select: { userId: true } },
        },
      });
      if (!booking) throw httpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (booking.client.userId !== req.user.id) {
        throw httpError(403, 'BOOKING_ACCESS_DENIED', 'You cannot review this booking.');
      }
      if (booking.status !== 'COMPLETED' || !booking.professional) {
        throw httpError(409, 'BOOKING_NOT_REVIEWABLE', 'Only completed professional bookings can be reviewed.');
      }

      const created = await tx.review.create({
        data: {
          bookingId: booking.id,
          clientId: req.user.id,
          professionalId: booking.professional.userId,
          rating: input.rating,
          comment: input.comment,
        },
        select: reviewSelect,
      });

      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProfessionalProfile"
        SET
          "averageRating" = (("averageRating" * "totalReviews") + ${input.rating}) / ("totalReviews" + 1),
          "totalReviews" = "totalReviews" + 1,
          "updatedAt" = NOW()
        WHERE "userId" = ${booking.professional.userId}
      `);
      await tx.notification.create({
        data: {
          userId: booking.professional.userId,
          bookingId: booking.id,
          type: 'SYSTEM',
          title: 'Nueva reseña recibida',
          message: `Has recibido una reseña de ${input.rating} estrellas.`,
          data: { kind: 'REVIEW_CREATED', reviewId: created.id },
        },
      });
      return created;
    });

    res.status(201).json({ success: true, review });
  } catch (error) {
    if (error.code === 'P2002') {
      return next(httpError(409, 'REVIEW_ALREADY_EXISTS', 'This booking has already been reviewed.'));
    }
    handleError(req, next, error, 'Review creation failed');
  }
};

exports.respondToReview = async (req, res, next) => {
  try {
    const reviewId = uuid.parse(req.params.reviewId);
    const { response } = responseSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.review.findFirst({
        where: { id: reviewId, professionalId: req.user.id },
        select: { id: true, clientId: true, bookingId: true, response: true },
      });
      if (!review) throw httpError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
      if (review.response) throw httpError(409, 'REVIEW_ALREADY_RESPONDED', 'The review already has a response.');

      const updated = await tx.review.updateMany({
        where: { id: review.id, professionalId: req.user.id, response: null },
        data: { response, responseAt: new Date() },
      });
      if (updated.count !== 1) {
        throw httpError(409, 'REVIEW_ALREADY_RESPONDED', 'The review already has a response.');
      }
      await tx.notification.create({
        data: {
          userId: review.clientId,
          bookingId: review.bookingId,
          type: 'SYSTEM',
          title: 'Respuesta a tu reseña',
          message: 'El profesional ha respondido a tu reseña.',
          data: { kind: 'REVIEW_RESPONSE', reviewId: review.id },
        },
      });
      return tx.review.findUnique({ where: { id: review.id }, select: reviewSelect });
    });

    res.json({ success: true, review: result });
  } catch (error) {
    handleError(req, next, error, 'Review response failed');
  }
};

exports.getMyReviews = async (req, res, next) => {
  try {
    const query = pageQuerySchema.parse(req.query);
    const where = {
      professionalId: req.user.id,
      ...(query.rating ? { rating: query.rating } : {}),
    };
    const [reviews, total] = await prisma.$transaction([
      prisma.review.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: reviewSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.review.count({ where }),
    ]);
    res.json({
      success: true,
      reviews,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    handleError(req, next, error, 'Owned review query failed');
  }
};
