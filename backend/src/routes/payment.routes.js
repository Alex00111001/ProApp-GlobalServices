const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Crear intención de pago
router.post('/create-intent', paymentController.createPaymentIntent);

// Confirmar pago
router.post('/confirm', paymentController.confirmPayment);

// Confirmar una reserva que se pagará en efectivo
router.post('/cash', paymentController.confirmCashPayment);

// Obtener historial de pagos
router.get('/history', paymentController.getPaymentHistory);

module.exports = router;
