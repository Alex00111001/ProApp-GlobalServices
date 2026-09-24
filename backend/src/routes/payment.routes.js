const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth');
const { responseContract } = require('../shared/http/response-contract');
const { paymentResponses } = require('../contracts/payment.responses');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Crear intención de pago
router.post('/create-intent', responseContract(paymentResponses.createIntent), paymentController.createPaymentIntent);

// Confirmar pago
router.post('/confirm', responseContract(paymentResponses.confirm), paymentController.confirmPayment);

// Legacy compatibility only. This is not an offered payment method and cannot mutate data.
router.post('/cash', paymentController.rejectRetiredCashPayment);

// Obtener historial de pagos
router.get('/history', responseContract(paymentResponses.history), paymentController.getPaymentHistory);

module.exports = router;
