const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener notificaciones del usuario
router.get('/', notificationController.getNotifications);

// Marcar notificación como leída
router.put('/:notificationId/read', notificationController.markAsRead);
router.patch('/:notificationId/read', notificationController.markAsRead);

// Marcar todas las notificaciones como leídas
router.put('/read-all', notificationController.markAllAsRead);
router.patch('/read-all', notificationController.markAllAsRead);

// Eliminar una notificación
router.delete('/:notificationId', notificationController.deleteNotification);

// Crear notificación (solo admin o sistema)
router.post('/', notificationController.createNotification);

module.exports = router;
