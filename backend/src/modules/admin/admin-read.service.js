const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const { writeAuditLog } = require('../audit/audit.service');

const httpError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const pagination = (page, limit, total) => ({
  page,
  limit,
  totalItems: total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
const skipFor = (page, limit) => (page - 1) * limit;
const maskEmail = (email) => {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '—';
  return `${local.slice(0, 2)}***@${domain}`;
};
const maskPhone = (phone) => phone ? `${String(phone).slice(0, 3)}***${String(phone).slice(-2)}` : null;
const money = (value) => new Prisma.Decimal(value || 0);
const moneyString = (value) => money(value).toFixed(2);

const dashboardDefinitions = Object.freeze({
  activeUsers: { label: 'Usuarios activos', unit: 'count', source: 'User.isActive', description: 'Cuentas habilitadas al generar el informe.' },
  activeProfessionals: { label: 'Profesionales activos', unit: 'count', source: 'ProfessionalProfile + User', description: 'Profesionales aprobados/activos con cuenta habilitada.' },
  requests: { label: 'Solicitudes', unit: 'count', source: 'Booking.createdAt', description: 'Reservas creadas dentro del periodo, incluido estado pendiente.' },
  bookings: { label: 'Reservas confirmadas', unit: 'count', source: 'Booking.status', description: 'Reservas no pendientes creadas dentro del periodo.' },
  completedServices: { label: 'Servicios completados', unit: 'count', source: 'Booking.completedAt', description: 'Reservas completadas dentro del periodo.' },
  gmv: { label: 'GMV', unit: 'money', source: 'Payment COMPLETED', description: 'Pagos completados procesados dentro del periodo.' },
  grossPlatformRevenue: { label: 'Ingreso bruto plataforma', unit: 'money', source: 'Booking pricing projections', description: 'Platform service fees más comisiones profesionales de pagos completados.' },
  netPlatformRevenue: { label: 'Ingreso neto plataforma', unit: 'money', source: 'Billing projections + completed refund allocations', description: 'Ingreso bruto menos platform fees y comisiones profesionales revertidas por reembolsos completados.' },
  platformFees: { label: 'Platform fees', unit: 'money', source: 'Booking.platformFee', description: 'Tarifa explícita al cliente en pagos completados.' },
  professionalCommissions: { label: 'Comisiones profesionales', unit: 'money', source: 'Booking.professionalCommission', description: 'Comisión profesional de pagos completados.' },
  refunds: { label: 'Reembolsos', unit: 'money', source: 'Refund COMPLETED', description: 'Volumen total de refunds completados dentro del periodo.' },
  takeRate: { label: 'Take rate', unit: 'percentage', source: 'Revenue / GMV', description: 'Ingreso bruto plataforma dividido entre GMV.' },
});

const getDashboard = async ({ from, to, currency, timezone }, client = prisma) => {
  const now = new Date();
  const rangeTo = to ? new Date(to) : now;
  const rangeFrom = from ? new Date(from) : new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  const createdRange = { gte: rangeFrom, lt: rangeTo };
  const paymentRange = { status: 'COMPLETED', currency, processedAt: createdRange };
  const completedPaymentBooking = { payment: { is: paymentRange } };

  const [
    activeUsers,
    activeProfessionals,
    requests,
    bookings,
    completedServices,
    paymentTotals,
    bookingEconomics,
    refundTotals,
    refundedPlatformRevenue,
    bookingsByStatus,
    recentBookings,
    latestBooking,
    latestPayment,
  ] = await Promise.all([
    client.user.count({ where: { isActive: true } }),
    client.professionalProfile.count({ where: { status: { in: ['APPROVED', 'ACTIVE'] }, user: { is: { isActive: true } } } }),
    client.booking.count({ where: { createdAt: createdRange } }),
    client.booking.count({ where: { createdAt: createdRange, status: { not: 'PENDING' } } }),
    client.booking.count({ where: { status: 'COMPLETED', completedAt: createdRange } }),
    client.payment.aggregate({ where: paymentRange, _sum: { amount: true } }),
    client.booking.aggregate({ where: completedPaymentBooking, _sum: { platformFee: true, professionalCommission: true } }),
    client.refund.aggregate({ where: { status: 'COMPLETED', currency, processedAt: createdRange }, _sum: { totalAmount: true } }),
    client.$queryRaw(Prisma.sql`
      WITH refund_minor AS (
        SELECT
          ROUND(r."serviceAmount" * 100) AS service_refund,
          ROUND(r."platformFeeAmount" * 100) AS platform_fee_refund,
          ROUND(b."serviceAmount" * 100) AS service_total,
          ROUND(b."professionalCommission" * 100) AS commission_total
        FROM "Refund" r
        JOIN "Booking" b ON b."id" = r."bookingId"
        WHERE r."status" = 'COMPLETED'::"RefundStatus"
          AND r."currency" = ${currency}
          AND r."processedAt" >= ${rangeFrom}
          AND r."processedAt" < ${rangeTo}
      )
      SELECT (
        COALESCE(SUM(
          platform_fee_refund + CASE
            WHEN service_total = 0 THEN 0
            ELSE FLOOR((service_refund * commission_total + FLOOR(service_total / 2)) / service_total)
          END
        ), 0) / 100
      )::text AS value
      FROM refund_minor
    `),
    client.booking.groupBy({ by: ['status'], where: { createdAt: createdRange }, _count: { _all: true } }),
    client.booking.findMany({
      where: { createdAt: createdRange },
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, scheduledDate: true, totalPrice: true, currency: true, createdAt: true,
        client: { select: { user: { select: { firstName: true, lastName: true } } } },
        professional: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    client.booking.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    client.payment.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
  ]);

  const gmv = money(paymentTotals._sum.amount);
  const platformFees = money(bookingEconomics._sum.platformFee);
  const commissions = money(bookingEconomics._sum.professionalCommission);
  const grossRevenue = platformFees.plus(commissions);
  const netRevenue = grossRevenue.minus(money(refundedPlatformRevenue[0]?.value));
  const takeRate = gmv.isZero() ? '0.00' : grossRevenue.dividedBy(gmv).times(100).toFixed(2);

  return {
    range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString(), timezone, currency },
    generatedAt: now.toISOString(),
    freshness: {
      latestBookingUpdateAt: latestBooking?.updatedAt || null,
      latestPaymentUpdateAt: latestPayment?.updatedAt || null,
      partialData: false,
    },
    metrics: {
      activeUsers,
      activeProfessionals,
      requests,
      bookings,
      completedServices,
      gmv: moneyString(gmv),
      grossPlatformRevenue: moneyString(grossRevenue),
      netPlatformRevenue: moneyString(netRevenue),
      platformFees: moneyString(platformFees),
      professionalCommissions: moneyString(commissions),
      refunds: moneyString(refundTotals._sum.totalAmount),
      takeRate,
    },
    definitions: dashboardDefinitions,
    bookingsByStatus: bookingsByStatus.map((item) => ({ status: item.status, count: item._count._all })),
    recentBookings: recentBookings.map((booking) => ({
      ...booking,
      totalPrice: moneyString(booking.totalPrice),
      clientName: `${booking.client.user.firstName} ${booking.client.user.lastName}`,
      professionalName: booking.professional ? `${booking.professional.user.firstName} ${booking.professional.user.lastName}` : null,
      client: undefined,
      professional: undefined,
    })),
  };
};

const listUsers = async ({ page, limit, search, role, active }, client = prisma) => {
  const where = {
    ...(role && { role }),
    ...(active !== undefined && { isActive: active }),
    ...(search && { OR: [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ] }),
  };
  const [items, total] = await Promise.all([
    client.user.findMany({
      where, skip: skipFor(page, limit), take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, email: true, phone: true, firstName: true, lastName: true, role: true,
        isActive: true, countryCode: true, createdAt: true, lastLoginAt: true,
        professionalProfile: { select: { status: true } },
      },
    }),
    client.user.count({ where }),
  ]);
  return {
    items: items.map(({ email, phone, ...item }) => ({ ...item, emailMasked: maskEmail(email), phoneMasked: maskPhone(phone) })),
    pagination: pagination(page, limit, total),
  };
};

const getUser = async (id, req, client = prisma) => {
  const user = await client.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, phone: true, firstName: true, lastName: true, avatarUrl: true, role: true,
      isActive: true, countryCode: true, createdAt: true, updatedAt: true, lastLoginAt: true,
      clientProfile: { select: { city: true, state: true, country: true, postalCode: true, totalBookings: true, totalSpent: true } },
      professionalProfile: { select: { id: true, status: true, totalBookings: true, averageRating: true, totalReviews: true, createdAt: true } },
      administrativeRoles: { where: { status: 'ACTIVE' }, select: { role: { select: { id: true, key: true, name: true } } } },
    },
  });
  if (!user) throw httpError(404, 'ADMIN_USER_NOT_FOUND', 'User was not found.');
  await writeAuditLog({ req, action: 'ADMIN_USER_SENSITIVE_READ', resourceType: 'USER', resourceId: id });
  return {
    ...user,
    clientProfile: user.clientProfile ? { ...user.clientProfile, totalSpent: moneyString(user.clientProfile.totalSpent) } : null,
    roles: user.administrativeRoles.map(({ role }) => role),
    administrativeRoles: undefined,
  };
};

const setUserActive = async ({ id, isActive, reason, req }, client = prisma) => {
  if (id === req.user.id && !isActive) throw httpError(409, 'ADMIN_SELF_DEACTIVATION_FORBIDDEN', 'Use a separate authorized administrator to deactivate this account.');
  return client.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
    if (!before) throw httpError(404, 'ADMIN_USER_NOT_FOUND', 'User was not found.');
    const after = await tx.user.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true, updatedAt: true } });
    if (!isActive) {
      await tx.adminSession.updateMany({
        where: { userId: id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'USER_DEACTIVATED' },
      });
    }
    await writeAuditLog({ req, action: 'ADMIN_USER_STATUS_CHANGED', resourceType: 'USER', resourceId: id, reason, before, after }, tx);
    return after;
  });
};

const listProfessionals = async ({ page, limit, search, status }, client = prisma) => {
  const where = {
    ...(status && { status }),
    ...(search && { user: { is: { OR: [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ] } } }),
  };
  const [items, total] = await Promise.all([
    client.professionalProfile.findMany({
      where, skip: skipFor(page, limit), take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, status: true, yearsOfExperience: true, totalBookings: true, averageRating: true,
        totalReviews: true, createdAt: true, verifiedAt: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true, countryCode: true } },
        _count: { select: { documents: true, categories: true, services: true } },
      },
    }),
    client.professionalProfile.count({ where }),
  ]);
  return {
    items: items.map((item) => ({ ...item, user: { ...item.user, email: undefined, emailMasked: maskEmail(item.user.email) } })),
    pagination: pagination(page, limit, total),
  };
};

const getProfessional = async (id, req, client = prisma) => {
  const professional = await client.professionalProfile.findUnique({
    where: { id },
    select: {
      id: true, status: true, bio: true, yearsOfExperience: true, hourlyRate: true, serviceRadius: true,
      totalBookings: true, totalEarnings: true, averageRating: true, totalReviews: true, verifiedAt: true,
      rejectedReason: true, createdAt: true, updatedAt: true, stripeTransfersStatus: true,
      user: { select: { id: true, email: true, phone: true, firstName: true, lastName: true, isActive: true, countryCode: true } },
      documents: { select: { id: true, type: true, status: true, reviewedAt: true, rejectionReason: true, expiresAt: true, createdAt: true } },
      categories: { select: { verified: true, yearsInCategory: true, category: { select: { id: true, name: true } } } },
    },
  });
  if (!professional) throw httpError(404, 'ADMIN_PROFESSIONAL_NOT_FOUND', 'Professional was not found.');
  await writeAuditLog({ req, action: 'ADMIN_PROFESSIONAL_SENSITIVE_READ', resourceType: 'PROFESSIONAL', resourceId: id });
  return {
    ...professional,
    hourlyRate: professional.hourlyRate ? moneyString(professional.hourlyRate) : null,
    totalEarnings: moneyString(professional.totalEarnings),
  };
};

const PROFESSIONAL_TRANSITIONS = Object.freeze({
  PENDING_REVIEW: new Set(['APPROVED', 'REJECTED']),
  APPROVED: new Set(['ACTIVE', 'SUSPENDED', 'INACTIVE']),
  ACTIVE: new Set(['SUSPENDED', 'INACTIVE']),
  SUSPENDED: new Set(['APPROVED', 'ACTIVE', 'INACTIVE']),
  REJECTED: new Set(['PENDING_REVIEW']),
  INACTIVE: new Set(['APPROVED', 'ACTIVE']),
});

const setProfessionalStatus = async ({ id, status, reason, req }, client = prisma) => client.$transaction(async (tx) => {
  const before = await tx.professionalProfile.findUnique({ where: { id }, select: { id: true, status: true, verifiedAt: true, rejectedReason: true } });
  if (!before) throw httpError(404, 'ADMIN_PROFESSIONAL_NOT_FOUND', 'Professional was not found.');
  if (before.status === status) return before;
  if (!PROFESSIONAL_TRANSITIONS[before.status]?.has(status)) {
    throw httpError(409, 'PROFESSIONAL_STATUS_TRANSITION_INVALID', `Cannot transition professional from ${before.status} to ${status}.`);
  }
  const after = await tx.professionalProfile.update({
    where: { id },
    data: {
      status,
      verifiedAt: ['APPROVED', 'ACTIVE'].includes(status) ? (before.verifiedAt || new Date()) : before.verifiedAt,
      rejectedReason: status === 'REJECTED' ? reason : null,
    },
    select: { id: true, status: true, verifiedAt: true, rejectedReason: true, updatedAt: true },
  });
  await writeAuditLog({ req, action: 'ADMIN_PROFESSIONAL_STATUS_CHANGED', resourceType: 'PROFESSIONAL', resourceId: id, reason, before, after }, tx);
  return after;
});

const listBookings = async ({ page, limit, search, status, from, to }, client = prisma) => {
  const where = {
    ...(status && { status }),
    ...((from || to) && { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lt: new Date(to) }) } }),
    ...(search && { OR: [
      { id: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { client: { is: { user: { is: { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ] } } } } },
    ] }),
  };
  const [items, total] = await Promise.all([
    client.booking.findMany({
      where, skip: skipFor(page, limit), take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, status: true, scheduledDate: true, city: true, totalPrice: true, currency: true, createdAt: true, updatedAt: true,
        client: { select: { user: { select: { firstName: true, lastName: true } } } },
        professional: { select: { user: { select: { firstName: true, lastName: true } } } },
        payment: { select: { status: true } },
      },
    }),
    client.booking.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item, totalPrice: moneyString(item.totalPrice),
      clientName: `${item.client.user.firstName} ${item.client.user.lastName}`,
      professionalName: item.professional ? `${item.professional.user.firstName} ${item.professional.user.lastName}` : null,
      client: undefined, professional: undefined,
    })),
    pagination: pagination(page, limit, total),
  };
};

const getBooking = async (id, req, client = prisma) => {
  const booking = await client.booking.findUnique({
    where: { id },
    include: {
      client: { select: { user: { select: { id: true, email: true, phone: true, firstName: true, lastName: true } } } },
      professional: { select: { id: true, status: true, user: { select: { id: true, email: true, phone: true, firstName: true, lastName: true } } } },
      bookingServices: { include: { service: { select: { id: true, name: true } } } },
      payment: { select: { id: true, status: true, method: true, amount: true, currency: true, processedAt: true } },
      refunds: { select: { id: true, status: true, totalAmount: true, currency: true, requestedAt: true, processedAt: true } },
      payout: { select: { id: true, status: true, amount: true, currency: true, requestedAt: true, processedAt: true } },
    },
  });
  if (!booking) throw httpError(404, 'ADMIN_BOOKING_NOT_FOUND', 'Booking was not found.');
  await writeAuditLog({ req, action: 'ADMIN_BOOKING_SENSITIVE_READ', resourceType: 'BOOKING', resourceId: id });
  return {
    ...booking,
    totalPrice: moneyString(booking.totalPrice), serviceAmount: moneyString(booking.serviceAmount),
    platformFee: moneyString(booking.platformFee), professionalCommission: moneyString(booking.professionalCommission),
    professionalEarnings: moneyString(booking.professionalEarnings),
    bookingServices: booking.bookingServices.map((item) => ({ ...item, price: moneyString(item.price), subtotal: moneyString(item.subtotal) })),
    payment: booking.payment ? { ...booking.payment, amount: moneyString(booking.payment.amount) } : null,
    refunds: booking.refunds.map((item) => ({ ...item, totalAmount: moneyString(item.totalAmount) })),
    payout: booking.payout ? { ...booking.payout, amount: moneyString(booking.payout.amount) } : null,
  };
};

const listAuditLogs = async ({ page, limit, search, actorId, resourceType, action, outcome, correlationId }, client = prisma) => {
  const where = {
    ...(actorId && { actorId }), ...(resourceType && { resourceType }), ...(action && { action }),
    ...(outcome && { outcome }), ...(correlationId && { correlationId }),
    ...(search && { OR: [{ action: { contains: search, mode: 'insensitive' } }, { resourceId: { contains: search, mode: 'insensitive' } }] }),
  };
  const [items, total] = await Promise.all([
    client.auditLog.findMany({
      where, skip: skipFor(page, limit), take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, action: true, resourceType: true, resourceId: true, outcome: true, reason: true,
        requestId: true, correlationId: true, traceId: true, metadata: true, createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    client.auditLog.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      actor: item.actor ? { ...item.actor, email: undefined, emailMasked: maskEmail(item.actor.email) } : null,
    })),
    pagination: pagination(page, limit, total),
  };
};

module.exports = {
  PROFESSIONAL_TRANSITIONS,
  dashboardDefinitions,
  getBooking,
  getDashboard,
  getProfessional,
  getUser,
  listAuditLogs,
  listBookings,
  listProfessionals,
  listUsers,
  maskEmail,
  maskPhone,
  pagination,
  setProfessionalStatus,
  setUserActive,
};
