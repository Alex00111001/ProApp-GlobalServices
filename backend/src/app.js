const express = require('express');
const cors = require('cors');
const prisma = require('./config/prisma');
const env = require('./config/env');
const { requestContext } = require('./middleware/request-context');

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
const paymentController = require('./controllers/payment.controller');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || (!env.isProduction && allowedOrigins.length === 0) || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(requestContext);

// Stripe requires the original bytes for signature verification.
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.stripeWebhook
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      service: 'homeservices-core-api',
      dependencies: { database: 'HEALTHY' },
      correlationId: req.context.correlationId,
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(503).json({
      status: 'OUTAGE',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' },
      correlationId: req.context.correlationId,
    });
  }
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

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    correlationId: req.context.correlationId,
  });
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  const correlationId = req.context?.correlationId;

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: err.message,
      code: 'VALIDATION_ERROR',
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
