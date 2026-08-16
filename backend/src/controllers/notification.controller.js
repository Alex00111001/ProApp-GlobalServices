const prisma = require('../lib/prisma');

/**
 * Obtener notificaciones del usuario
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const whereClause = {
      userId,
      ...(unreadOnly === 'true' ? { isRead: false } : {})
    };

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            scheduledDate: true
          }
        }
      }
    });

    const total = await prisma.notification.count({
      where: whereClause
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo notificaciones',
      error: error.message 
    });
  }
};

/**
 * Marcar notificación como leída
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    // Verificar que la notificación pertenece al usuario
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notificación no encontrada' 
      });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permiso para modificar esta notificación' 
      });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });

    res.json({
      success: true,
      notification: updatedNotification
    });

  } catch (error) {
    console.error('Error marcando notificación como leída:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando notificación',
      error: error.message 
    });
  }
};

/**
 * Marcar todas las notificaciones como leídas
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json({
      success: true,
      message: 'Todas las notificaciones marcadas como leídas'
    });

  } catch (error) {
    console.error('Error marcando todas las notificaciones como leídas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando notificaciones',
      error: error.message 
    });
  }
};

/**
 * Eliminar una notificación
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notificación no encontrada' 
      });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permiso para eliminar esta notificación' 
      });
    }

    await prisma.notification.delete({
      where: { id: notificationId }
    });

    res.json({
      success: true,
      message: 'Notificación eliminada'
    });

  } catch (error) {
    console.error('Error eliminando notificación:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando notificación',
      error: error.message 
    });
  }
};

/**
 * Crear notificación push (para uso interno o admin)
 */
exports.createNotification = async (req, res) => {
  try {
    const { userId, type, title, message, bookingId } = req.body;

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        bookingId,
        isRead: false
      }
    });

    // Aquí se podría integrar con Firebase Cloud Messaging o APNs
    // para enviar la notificación push real al dispositivo móvil

    res.json({
      success: true,
      notification
    });

  } catch (error) {
    console.error('Error creando notificación:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando notificación',
      error: error.message 
    });
  }
};
