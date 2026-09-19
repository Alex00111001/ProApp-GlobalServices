const { z } = require('zod');

const uuid = z.string().uuid();
const bookingStatuses = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

const pagination = ({ defaultLimit, maxLimit }) => z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
}).strict();

const legacyReason = z.union([z.string(), z.null()]).optional().transform((value) => (
  typeof value === 'string' ? value.trim().slice(0, 500) : null
));
const boundedText = (min, max) => z.string().trim().min(min).max(max).refine(
  (value) => !/[\u0000-\u001F\u007F]/.test(value),
  'Control characters are not allowed.'
);
const httpsUrl = z.string().trim().url().max(2048).refine(
  (value) => /^https:\/\//i.test(value),
  'URL must use HTTPS.'
);

const bookingIdParams = z.object({ id: uuid }).strict();
const bookingListQuery = pagination({ defaultLimit: 10, maxLimit: 50 }).extend({
  status: z.enum(bookingStatuses).optional(),
}).strict();
const bookingCancellationBody = z.object({ reason: legacyReason }).strip().default({ reason: null });
const bookingRejectionBody = z.object({ reason: legacyReason }).strip().default({ reason: null });

const notificationIdParams = z.object({ notificationId: uuid }).strict();
const notificationListQuery = pagination({ defaultLimit: 20, maxLimit: 50 }).extend({
  unreadOnly: z.enum(['true', 'false']).optional(),
}).strict();

const paymentIntentId = z.string().trim().regex(/^pi_[A-Za-z0-9]+$/, 'Invalid payment intent identifier.').max(255);
const paymentIntentBody = z.object({ bookingId: uuid }).strict();
const paymentConfirmationBody = z.object({ bookingId: uuid, paymentIntentId }).strict();
const paymentHistoryQuery = pagination({ defaultLimit: 10, maxLimit: 50 });

const favoriteProfessionalParams = z.object({ professionalId: uuid }).strict();
const favoriteProfessionalBody = z.object({ professionalId: uuid }).strict();
const favoriteListQuery = pagination({ defaultLimit: 20, maxLimit: 100 });

const categoryIdParams = z.object({ id: uuid }).strict();
const categoryFields = {
  name: boundedText(2, 120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid category slug.').max(120),
  description: boundedText(1, 2_000).nullable().optional(),
  iconUrl: httpsUrl.nullable().optional(),
};
const categoryCreateBody = z.object(categoryFields).strict();
const categoryUpdateBody = z.object({ ...categoryFields, isActive: z.boolean().optional() }).partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  'At least one category field is required.'
);

const documentIdParams = z.object({ id: uuid }).strict();
const pendingDocumentQuery = pagination({ defaultLimit: 20, maxLimit: 100 });
const auditLogQuery = pagination({ defaultLimit: 50, maxLimit: 100 }).extend({
  adminId: uuid.optional(),
  entityType: boundedText(1, 120).optional(),
}).strict();
const documentRejectionBody = z.object({ reason: boundedText(10, 500) }).strip();

module.exports = {
  auditLogQuery,
  bookingCancellationBody,
  bookingIdParams,
  bookingListQuery,
  bookingRejectionBody,
  categoryCreateBody,
  categoryIdParams,
  categoryUpdateBody,
  documentIdParams,
  documentRejectionBody,
  favoriteListQuery,
  favoriteProfessionalBody,
  favoriteProfessionalParams,
  notificationIdParams,
  notificationListQuery,
  paymentConfirmationBody,
  paymentHistoryQuery,
  paymentIntentBody,
  pendingDocumentQuery,
};
