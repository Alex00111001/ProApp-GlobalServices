const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');
const { writeAuditLog } = require('../modules/audit/audit.service');

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
      select: {
        id: true,
        status: true,
        scheduledDate: true,
        city: true,
        totalPrice: true,
        currency: true,
        createdAt: true,
        client: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
        professional: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
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
    logError(req, error, 'Admin dashboard query failed');
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

    await writeAuditLog({
      req,
      action: 'ADMIN_DOCUMENT_QUEUE_READ',
      resourceType: 'DOCUMENT',
      metadata: { page: parseInt(page), returnedItems: documents.length },
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
    logError(req, error, 'Pending document query failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Aprobar documento (solo admin)
exports.approveDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.$transaction(async (tx) => {
      const before = await tx.document.findUnique({
        where: { id },
        select: { id: true, type: true, status: true, professionalId: true, professional: { select: { userId: true } } },
      });
      if (!before) throw Object.assign(new Error('Document was not found.'), { statusCode: 404, code: 'DOCUMENT_NOT_FOUND' });
      if (before.status !== 'PENDING_REVIEW') throw Object.assign(new Error('Document has already been reviewed.'), { statusCode: 409, code: 'DOCUMENT_ALREADY_REVIEWED' });
      const updated = await tx.document.update({
        where: { id },
        data: { status: 'APPROVED', reviewedBy: req.user.id, reviewedAt: new Date(), rejectionReason: null },
        select: { id: true, type: true, status: true, professionalId: true, reviewedAt: true },
      });
      await tx.notification.create({
        data: { userId: before.professional.userId, type: 'SYSTEM', title: 'Documento Aprobado', message: `Tu documento ${before.type} ha sido aprobado.` },
      });
      await writeAuditLog({ req, action: 'DOCUMENT_APPROVED', resourceType: 'DOCUMENT', resourceId: id, before: { status: before.status }, after: { status: updated.status } }, tx);
      return updated;
    });

    res.json({
      message: 'Document approved successfully',
      document,
    });
  } catch (error) {
    logError(req, error, 'Document approval failed');
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Internal server error',
      code: error.code,
      correlationId: req.context?.correlationId,
    });
  }
};

// Rechazar documento (solo admin)
exports.rejectDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A rejection reason of at least 10 characters is required.', code: 'REJECTION_REASON_REQUIRED' });
    }
    const document = await prisma.$transaction(async (tx) => {
      const before = await tx.document.findUnique({
        where: { id },
        select: { id: true, type: true, status: true, professionalId: true, professional: { select: { userId: true } } },
      });
      if (!before) throw Object.assign(new Error('Document was not found.'), { statusCode: 404, code: 'DOCUMENT_NOT_FOUND' });
      if (before.status !== 'PENDING_REVIEW') throw Object.assign(new Error('Document has already been reviewed.'), { statusCode: 409, code: 'DOCUMENT_ALREADY_REVIEWED' });
      const updated = await tx.document.update({
        where: { id },
        data: { status: 'REJECTED', reviewedBy: req.user.id, reviewedAt: new Date(), rejectionReason: reason.trim() },
        select: { id: true, type: true, status: true, professionalId: true, reviewedAt: true, rejectionReason: true },
      });
      await tx.notification.create({
        data: { userId: before.professional.userId, type: 'SYSTEM', title: 'Documento Rechazado', message: `Tu documento ${before.type} ha sido rechazado. Razón: ${reason.trim()}` },
      });
      await writeAuditLog({ req, action: 'DOCUMENT_REJECTED', resourceType: 'DOCUMENT', resourceId: id, reason, before: { status: before.status }, after: { status: updated.status } }, tx);
      return updated;
    });

    res.json({
      message: 'Document rejected',
      document,
    });
  } catch (error) {
    logError(req, error, 'Document rejection failed');
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Internal server error',
      code: error.code,
      correlationId: req.context?.correlationId,
    });
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
    logError(req, error, 'Audit log query failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
