const prisma = require('../config/prisma');

// Obtener dashboard con KPIs generales (solo admin)
exports.getDashboard = async (req, res) => {
  try {
    // Contadores generales
    const totalUsers = await prisma.user.count();
    const totalClients = await prisma.clientProfile.count();
    const totalProfessionals = await prisma.professionalProfile.count();
    const approvedProfessionals = await prisma.professionalProfile.count({
      where: { status: 'APPROVED' },
    });
    const pendingProfessionals = await prisma.professionalProfile.count({
      where: { status: 'PENDING_REVIEW' },
    });

    const totalBookings = await prisma.booking.count();
    const completedBookings = await prisma.booking.count({
      where: { status: 'COMPLETED' },
    });
    const pendingBookings = await prisma.booking.count({
      where: { status: 'PENDING' },
    });

    // Ingresos totales (suma de todos los payments completados)
    const payments = await prisma.payment.findMany({
      where: { status: 'COMPLETED' },
      select: { amount: true },
    });
    const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    // Reservas por estado
    const bookingsByStatus = await prisma.booking.groupBy({
      by: ['status'],
      _count: true,
    });

    // Profesionales por categoría
    const professionalsByCategory = await prisma.professionalCategory.groupBy({
      by: ['categoryId'],
      _count: true,
    });

    const categories = await prisma.category.findMany({
      where: { id: { in: professionalsByCategory.map(p => p.categoryId) } },
      select: { id: true, name: true },
    });

    // Top profesionales por earnings
    const topProfessionals = await prisma.professionalProfile.findMany({
      take: 10,
      orderBy: { totalEarnings: 'desc' },
      include: {
        user: {
          select: { firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    // Actividad reciente (últimas reservas)
    const recentBookings = await prisma.booking.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { include: { user: true } },
        professional: { include: { user: true } },
      },
    });

    res.json({
      kpis: {
        totalUsers,
        totalClients,
        totalProfessionals,
        approvedProfessionals,
        pendingProfessionals,
        totalBookings,
        completedBookings,
        pendingBookings,
        totalRevenue,
      },
      bookingsByStatus,
      professionalsByCategory: professionalsByCategory.map(pc => ({
        category: categories.find(c => c.id === pc.categoryId),
        count: pc._count,
      })),
      topProfessionals,
      recentBookings,
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener documentos pendientes de revisión (solo admin)
exports.getPendingDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const documents = await prisma.document.findMany({
      where: { status: 'PENDING_REVIEW' },
      skip,
      take: parseInt(limit),
      include: {
        professional: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.document.count({
      where: { status: 'PENDING_REVIEW' },
    });

    res.json({
      documents,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get pending documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Aprobar documento (solo admin)
exports.approveDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
      include: {
        professional: {
          include: { user: true },
        },
      },
    });

    // Crear notificación
    await prisma.notification.create({
      data: {
        userId: document.professional.userId,
        type: 'SYSTEM',
        title: 'Documento Aprobado',
        message: `Tu documento ${document.type} ha sido aprobado.`,
      },
    });

    // Registrar en audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.user.id,
        action: 'DOCUMENT_APPROVED',
        entityType: 'DOCUMENT',
        entityId: document.id,
        newValue: { status: 'APPROVED' },
      },
    });

    res.json({
      message: 'Document approved successfully',
      document,
    });
  } catch (error) {
    console.error('Approve document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Rechazar documento (solo admin)
exports.rejectDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const document = await prisma.document.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        rejectionReason: reason || 'No cumple con los requisitos',
      },
      include: {
        professional: {
          include: { user: true },
        },
      },
    });

    // Crear notificación
    await prisma.notification.create({
      data: {
        userId: document.professional.userId,
        type: 'SYSTEM',
        title: 'Documento Rechazado',
        message: `Tu documento ${document.type} ha sido rechazado. Razón: ${reason || 'No cumple con los requisitos'}`,
      },
    });

    // Registrar en audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.user.id,
        action: 'DOCUMENT_REJECTED',
        entityType: 'DOCUMENT',
        entityId: document.id,
        newValue: { status: 'REJECTED', reason },
      },
    });

    res.json({
      message: 'Document rejected',
      document,
    });
  } catch (error) {
    console.error('Reject document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener logs de auditoría (solo admin)
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId, entityType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (adminId) where.adminId = adminId;
    if (entityType) where.entityType = entityType;

    const logs = await prisma.adminAuditLog.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.adminAuditLog.count({ where });

    res.json({
      logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
