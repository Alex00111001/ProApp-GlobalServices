const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { loginLimiter, recoveryLimiter, registerLimiter, verificationLimiter } = require('../middleware/auth-rate-limit');

// Rutas públicas
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/password-recovery/request', recoveryLimiter, authController.requestPasswordRecovery);
router.post('/password-recovery/confirm', recoveryLimiter, authController.confirmPasswordRecovery);
router.post('/email-verification/confirm', verificationLimiter, authController.confirmEmailVerification);

// Rutas protegidas
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/email-verification/request', verificationLimiter, authenticate, authController.requestEmailVerification);
router.post('/logout', authenticate, authController.logout);
router.get('/sessions', authenticate, authController.listSessions);
router.post('/sessions/:sessionId/revoke', authenticate, authController.revokeSession);

module.exports = router;
