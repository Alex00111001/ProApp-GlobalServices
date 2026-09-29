const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { authenticate, authorize, requireApprovedProfessional } = require('../middleware/auth');
const { responseContract } = require('../shared/http/response-contract');
const { bookingResponses, bookingMutationResponses } = require('../contracts/booking.responses');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para clientes
router.post('/', authorize('CLIENT'), responseContract(bookingMutationResponses.create), bookingController.createBooking);
router.get('/client/my-bookings', authorize('CLIENT'), responseContract(bookingResponses.customerList), bookingController.getClientBookings);

// Rutas para profesionales
router.get('/professional/my-bookings', authorize('PROFESSIONAL'), responseContract(bookingResponses.professionalList), bookingController.getProfessionalBookings);
router.get('/:id', responseContract(bookingResponses.detail), bookingController.getBookingById);
router.post('/:id/confirm', authorize('PROFESSIONAL'), requireApprovedProfessional, responseContract(bookingMutationResponses.confirm), bookingController.confirmBooking);
router.post('/:id/reject', authorize('PROFESSIONAL'), requireApprovedProfessional, responseContract(bookingMutationResponses.reject), bookingController.rejectBooking);
router.post('/:id/start', authorize('PROFESSIONAL'), requireApprovedProfessional, responseContract(bookingMutationResponses.start), bookingController.startBooking);
router.post('/:id/complete', authorize('PROFESSIONAL'), requireApprovedProfessional, responseContract(bookingMutationResponses.complete), bookingController.completeBooking);

// Cancelar reserva (cliente o profesional)
router.post('/:id/cancel', responseContract(bookingMutationResponses.cancel), bookingController.cancelBooking);

module.exports = router;
