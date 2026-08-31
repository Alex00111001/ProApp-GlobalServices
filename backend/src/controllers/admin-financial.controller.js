const { z } = require('zod');
const stripe = require('../config/stripe');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { runPayoutReconciliation } = require('../modules/billing/reconciliation/payout-reconciliation.service');

const idSchema = z.string().uuid();
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
const disputeListSchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'WON', 'LOST', 'WARNING_CLOSED']).optional(),
}).strict();
const reconciliationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100) }).strict();
const bookingSelect = {
  id: true,
  status: true,
  completedAt: true,
  totalPrice: true,
  serviceAmount: true,
  platformFee: true,
  professionalCommission: true,
  professionalEarnings: true,
  currency: true,
};
const paymentSelect = {
  id: true,
  status: true,
  method: true,
  amount: true,
  currency: true,
  transactionId: true,
  providerChargeId: true,
  processedAt: true,
  refundAmount: true,
  refundedAt: true,
};

const handleError = (error, res, next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Invalid financial operation',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  return next(error);
};

exports.listDisputes = async (req, res, next) => {
  try {
    const query = disputeListSchema.parse(req.query);
    const where = query.status ? { status: query.status } : {};
    const [disputes, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { openedAt: 'desc' },
        include: {
          booking: { select: bookingSelect },
          payment: { select: paymentSelect },
          payout: true,
        },
      }),
      prisma.dispute.count({ where }),
    ]);
    res.json({
      disputes,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.getDispute = async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        booking: { select: bookingSelect },
        payment: { select: paymentSelect },
        payout: true,
        ledgerTransactions: { include: { entries: true } },
      },
    });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    res.json({ dispute });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.listReconciliationRuns = async (req, res, next) => {
  try {
    const query = paginationSchema.parse(req.query);
    const [runs, total] = await prisma.$transaction([
      prisma.reconciliationRun.findMany({
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { startedAt: 'desc' },
      }),
      prisma.reconciliationRun.count(),
    ]);
    res.json({
      runs,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.getReconciliationRun = async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const run = await prisma.reconciliationRun.findUnique({ where: { id }, include: { items: true } });
    if (!run) return res.status(404).json({ error: 'Reconciliation run not found' });
    res.json({ run });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.runReconciliation = async (req, res, next) => {
  try {
    if (!env.financialReconciliationEnabled) {
      return res.status(503).json({
        error: 'Financial reconciliation is disabled',
        code: 'FINANCIAL_RECONCILIATION_DISABLED',
      });
    }
    const input = reconciliationSchema.parse(req.body || {});
    const result = await runPayoutReconciliation({
      initiatedBy: req.user.id,
      stripeClient: stripe,
      requireLedger: env.financialLedgerDualWriteEnabled,
      requestContext: req.context,
      limit: input.limit,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(error, res, next);
  }
};
