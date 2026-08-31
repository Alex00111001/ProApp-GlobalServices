const { z } = require('zod');
const stripe = require('../config/stripe');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { approveRefundInTx, rejectRefundInTx } = require('../modules/billing/refunds/refund-approval.service');
const { executeApprovedRefund } = require('../modules/billing/refunds/refund-execution.service');

const idSchema = z.string().uuid();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
}).strict();
const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

const handleError = (error, res, next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Invalid refund request',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  return next(error);
};

exports.listRefunds = async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const where = query.status ? { status: query.status } : {};
    const [refunds, total] = await prisma.$transaction([
      prisma.refund.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { requestedAt: 'desc' },
        include: { decisionRecord: true, booking: true, payment: true },
      }),
      prisma.refund.count({ where }),
    ]);
    res.json({
      refunds,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.getRefund = async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const refund = await prisma.refund.findUnique({
      where: { id },
      include: { decisionRecord: true, booking: true, payment: true, ledgerTransactions: { include: { entries: true } } },
    });
    if (!refund) return res.status(404).json({ error: 'Refund not found' });
    res.json({ refund });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.approveRefund = async (req, res, next) => {
  try {
    const refundId = idSchema.parse(req.params.id);
    const result = await prisma.$transaction((tx) => approveRefundInTx({
      tx,
      refundId,
      approverId: req.user.id,
      requestContext: req.context,
    }));
    res.json({ refund: result.refund, duplicate: result.duplicate });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.rejectRefund = async (req, res, next) => {
  try {
    const refundId = idSchema.parse(req.params.id);
    const { reason } = rejectSchema.parse(req.body);
    const result = await prisma.$transaction((tx) => rejectRefundInTx({
      tx,
      refundId,
      reviewerId: req.user.id,
      reason,
      requestContext: req.context,
    }));
    res.json({ refund: result.refund, duplicate: result.duplicate });
  } catch (error) {
    handleError(error, res, next);
  }
};

exports.executeRefund = async (req, res, next) => {
  try {
    if (!env.financialRefundExecutionEnabled) {
      return res.status(503).json({
        error: 'Refund execution is disabled',
        code: 'REFUND_EXECUTION_DISABLED',
      });
    }
    const refundId = idSchema.parse(req.params.id);
    const result = await executeApprovedRefund({
      refundId,
      executorId: req.user.id,
      stripeClient: stripe,
      ledgerEnabled: env.financialLedgerDualWriteEnabled,
      requestContext: req.context,
    });
    res.status(result.pending ? 202 : 200).json({
      refund: result.refund,
      duplicate: result.duplicate,
      pending: result.pending,
    });
  } catch (error) {
    handleError(error, res, next);
  }
};
