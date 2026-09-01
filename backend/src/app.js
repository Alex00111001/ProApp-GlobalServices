const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { requestContext } = require('./middleware/request-context');
const { errorContract } = require('./shared/http/error-contract');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { httpLogger } = require('./modules/observability/logger');
const { reportError } = require('./modules/observability/error.service');
const { ensureIncidentForError } = require('./modules/observability/incident.service');
const { getLiveness, getReadiness } = require('./modules/observability/health.service');
const { metricsMiddleware } = require('./modules/observability/metrics');

const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const professionalRoutes = require('./routes/professional.routes');
const bookingRoutes = require('./routes/booking.routes');
const uploadRoutes = require('./routes/upload.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payment.routes');
const notificationRoutes = require('./routes/notification.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const reviewRoutes = require('./routes/review.routes');
const eventRoutes = require('./routes/event.routes');
const operationsRoutes = require('./routes/operations.routes');
const paymentController = require('./controllers/payment.controller');

const app = express();

app.use(requestContext);
app.use(errorContract);
app.use(cors({
  origin(origin, callback) {
    if (!origin || (!env.isProduction && env.corsOrigins.length === 0) || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(Object.assign(new Error('Origin not allowed by CORS'), {
      code: 'CORS_ORIGIN_DENIED',
      statusCode: 403,
    }));
  },
}));
app.use(httpLogger);
app.use(metricsMiddleware);
app.use(helmet());
app.use(rateLimit({
  windowMs: 60_000,
  limit: 300,
  skip: (req) => req.path === '/health' || req.path.startsWith('/health/'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' }),
}));

// Stripe requires the original bytes for signature verification.
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.stripeWebhook
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health/live', (req, res) => res.status(200).json({
  ...getLiveness(),
  correlationId: req.context.correlationId,
}));

app.get(['/health', '/health/ready'], async (req, res) => {
  const health = await getReadiness(prisma);
  res.status(health.status === 'OUTAGE' ? 503 : 200).json({
    ...health,
    correlationId: req.context.correlationId,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/professionals', professionalRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin/operations', operationsRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    correlationId: req.context.correlationId,
  });
});

app.use(async (err, req, res, next) => {
  req.log?.error({ err, correlationId: req.context?.correlationId }, 'Unhandled request error');
  const correlationId = req.context?.correlationId;
  const explicitStatus = Number(err.statusCode || err.status);
  const statusCode = Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus <= 599
    ? explicitStatus
    : err.name === 'ValidationError' || err.name === 'ZodError'
      ? 400
      : 500;

  if (statusCode >= 500) {
    try {
      const errorReport = await reportError(err, req);
      await ensureIncidentForError(errorReport);
    } catch (reportingError) {
      req.log?.error({ err: reportingError }, 'Error reporting failed');
    }
  }

  if (statusCode < 500) {
    return res.status(statusCode).json({
      error: err.message,
      code: err.code || (statusCode === 400 ? 'VALIDATION_ERROR' : undefined),
      correlationId,
    });
  }

  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    correlationId,
    message: env.isProduction ? undefined : err.message,
  });
});

module.exports = app;
