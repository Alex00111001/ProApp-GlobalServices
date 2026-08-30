const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { authenticate, authorize, requireApprovedProfessional } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para clientes
router.post('/', authorize('CLIENT'), bookingController.createBooking);
router.get('/client/my-bookings', authorize('CLIENT'), bookingController.getClientBookings);

// Rutas para profesionales
router.get('/professional/my-bookings', authorize('PROFESSIONAL'), bookingController.getProfessionalBookings);
router.get('/:id', bookingController.getBookingById);
router.post('/:id/confirm', authorize('PROFESSIONAL'), requireApprovedProfessional, bookingController.confirmBooking);
router.post('/:id/complete', authorize('PROFESSIONAL'), requireApprovedProfessional, bookingController.completeBooking);

// Cancelar reserva (cliente o profesional)
router.post('/:id/cancel', bookingController.cancelBooking);

module.exports = router;
