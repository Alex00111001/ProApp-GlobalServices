const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');
const { responseContract } = require('../shared/http/response-contract');
const { notificationResponses } = require('../contracts/notification.responses');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener notificaciones del usuario
router.get('/', responseContract(notificationResponses.list), notificationController.getNotifications);

// Marcar notificación como leída
router.put('/:notificationId/read', responseContract(notificationResponses.markReadPut), notificationController.markAsRead);
router.patch('/:notificationId/read', responseContract(notificationResponses.markReadPatch), notificationController.markAsRead);

// Marcar todas las notificaciones como leídas
router.put('/read-all', responseContract(notificationResponses.markAllReadPut), notificationController.markAllAsRead);
router.patch('/read-all', responseContract(notificationResponses.markAllReadPatch), notificationController.markAllAsRead);

// Eliminar una notificación
router.delete('/:notificationId', responseContract(notificationResponses.delete), notificationController.deleteNotification);

module.exports = router;
