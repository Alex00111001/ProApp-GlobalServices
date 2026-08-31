const { z } = require('zod');
const stripe = require('../config/stripe');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { approvePayoutInTx } = require('../modules/billing/payouts/payout-approval.service');
const { executeApprovedPayout } = require('../modules/billing/payouts/payout-execution.service');

const idSchema = z.string().uuid();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED']).optional(),
}).strict();
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
const earningSelect = {
  id: true,
  amount: true,
  platformFee: true,
  netAmount: true,
  status: true,
  payoutDate: true,
  createdAt: true,
};
const professionalSelect = {
  id: true,
  status: true,
  stripeAccountId: true,
  stripeTransfersStatus: true,
  user: { select: { id: true, firstName: true, lastName: true } },
};

const handleError = (error, res, next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Invalid payout request',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  return next(error);
};

exports.listPayouts = async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const where = query.status ? { status: query.status } : {};
    const [payouts, total] = await prisma.$transaction([
      prisma.payout.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { requestedAt: 'desc' },
        include: {
          booking: { select: bookingSelect },
          payment: { select: paymentSelect },
          earning: { select: earningSelect },
          professional: { select: professionalSelect },
        },
      }),
      prisma.payout.count({ where }),
    ]);
    res.json({
      payouts,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.getPayout = async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const payout = await prisma.payout.findUnique({
      where: { id },
      include: {
        booking: { select: bookingSelect },
        payment: { select: paymentSelect },
        earning: { select: earningSelect },
        professional: { select: professionalSelect },
        disputes: true,
        ledgerTransactions: { include: { entries: true } },
      },
    });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    res.json({ payout });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.approvePayout = async (req, res, next) => {
  try {
    const payoutId = idSchema.parse(req.params.id);
    const result = await prisma.$transaction((tx) => approvePayoutInTx({
      tx,
      payoutId,
      approverId: req.user.id,
      requestContext: req.context,
    }));
    res.json({ payout: result.payout, duplicate: result.duplicate });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.executePayout = async (req, res, next) => {
  try {
    if (!env.financialPayoutExecutionEnabled) {
      return res.status(503).json({
        error: 'Payout execution is disabled',
        code: 'PAYOUT_EXECUTION_DISABLED',
      });
    }
    const payoutId = idSchema.parse(req.params.id);
    const result = await executeApprovedPayout({
      payoutId,
      executorId: req.user.id,
      stripeClient: stripe,
      ledgerEnabled: env.financialLedgerDualWriteEnabled,
      requestContext: req.context,
    });
    res.json({ payout: result.payout, duplicate: result.duplicate });
  } catch (error) {
    handleError(error, res, next);
  }
};
