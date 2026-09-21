const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { loginLimiter, recoveryLimiter, registerLimiter, verificationLimiter } = require('../middleware/auth-rate-limit');
const { responseContract } = require('../shared/http/response-contract');
const { authResponses } = require('../contracts/auth.responses');

// Rutas públicas
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', responseContract(authResponses.refresh), authController.refresh);
router.post('/password-recovery/request', recoveryLimiter, responseContract(authResponses.requestPasswordRecovery), authController.requestPasswordRecovery);
router.post('/password-recovery/confirm', recoveryLimiter, responseContract(authResponses.confirmPasswordRecovery), authController.confirmPasswordRecovery);
router.post('/email-verification/confirm', verificationLimiter, responseContract(authResponses.confirmEmailVerification), authController.confirmEmailVerification);

// Rutas protegidas
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/change-password', authenticate, responseContract(authResponses.changePassword), authController.changePassword);
router.post('/email-verification/request', verificationLimiter, authenticate, responseContract(authResponses.requestEmailVerification), authController.requestEmailVerification);
router.post('/logout', authenticate, responseContract(authResponses.logout), authController.logout);
router.get('/sessions', authenticate, responseContract(authResponses.listSessions), authController.listSessions);
router.post('/sessions/:sessionId/revoke', authenticate, responseContract(authResponses.revokeSession), authController.revokeSession);

module.exports = router;
