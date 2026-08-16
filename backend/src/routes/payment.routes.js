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

// Obtener historial de pagos
router.get('/history', paymentController.getPaymentHistory);

// Webhook de Stripe (no requiere autenticación, se valida con firma)
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.stripeWebhook);

module.exports = router;
