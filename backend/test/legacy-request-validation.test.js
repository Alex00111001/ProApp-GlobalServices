process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('../src/config/prisma');
const adminController = require('../src/controllers/admin.controller');
const bookingController = require('../src/controllers/booking.controller');
const categoryController = require('../src/controllers/category.controller');
const favoriteController = require('../src/controllers/favorite.controller');
const notificationController = require('../src/controllers/notification.controller');
const paymentController = require('../src/controllers/payment.controller');
const {
  bookingListQuery,
  notificationListQuery,
  paymentConfirmationBody,
} = require('../src/validators/legacy-request.validators');

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  set() { return this; },
});

const expectValidationBeforePersistence = async ({ handler, req, replace, expectedResponse }) => {
  const original = replace.target[replace.method];
  let called = false;
  let nextError;
  replace.target[replace.method] = async () => {
    called = true;
    throw new Error(`Persistence was reached through ${replace.method}`);
  };
  try {
    const res = response();
    await handler({ ...req, log: { error() {} } }, res, (error) => { nextError = error; });
    assert.equal(called, false, `${replace.method} must not run for malformed input`);
    if (expectedResponse) {
      assert.equal(nextError, undefined);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, expectedResponse);
    } else {
      assert.equal(nextError?.name, 'ZodError');
    }
  } finally {
    replace.target[replace.method] = original;
  }
};

test('legacy list schemas reject malformed, excessive and unknown query input', () => {
  assert.deepEqual(bookingListQuery.parse({}), { page: 1, limit: 10 });
  assert.deepEqual(notificationListQuery.parse({ page: '2', limit: '20', unreadOnly: 'true' }), {
    page: 2,
    limit: 20,
    unreadOnly: 'true',
  });
  for (const input of [{ page: '0' }, { limit: '51' }, { page: 'not-a-number' }, { unexpected: 'value' }]) {
    assert.throws(() => bookingListQuery.parse(input));
  }
  assert.throws(() => paymentConfirmationBody.parse({
    bookingId: '6b082b84-9d1e-4b6f-a3f1-7dfb85f66d0c',
    paymentIntentId: 'not-a-stripe-payment-intent',
  }));
});

test('malformed legacy requests are rejected before persistence or Stripe-dependent lookup', async () => {
  await expectValidationBeforePersistence({
    handler: bookingController.getClientBookings,
    req: { query: { page: 'not-a-number' }, user: {} },
    replace: { target: prisma.booking, method: 'findMany' },
  });
  await expectValidationBeforePersistence({
    handler: notificationController.getNotifications,
    req: { query: { limit: '0' }, user: { id: 'user-1' } },
    replace: { target: prisma.notification, method: 'findMany' },
  });
  await expectValidationBeforePersistence({
    handler: paymentController.createPaymentIntent,
    req: { body: { bookingId: 'not-a-uuid' }, user: { id: 'user-1' } },
    replace: { target: prisma.booking, method: 'findUnique' },
    expectedResponse: { success: false, message: 'bookingId es obligatorio' },
  });
  await expectValidationBeforePersistence({
    handler: favoriteController.addFavorite,
    req: { body: { professionalId: 'not-a-uuid' }, user: { clientProfile: { id: 'client-1' } } },
    replace: { target: prisma.professionalProfile, method: 'findUnique' },
    expectedResponse: { error: 'professionalId is required' },
  });
  await expectValidationBeforePersistence({
    handler: categoryController.getCategoryById,
    req: { params: { id: 'not-a-uuid' } },
    replace: { target: prisma.category, method: 'findUnique' },
  });
  await expectValidationBeforePersistence({
    handler: adminController.getPendingDocuments,
    req: { query: { limit: '101' } },
    replace: { target: prisma.document, method: 'findMany' },
  });
  await expectValidationBeforePersistence({
    handler: adminController.rejectDocument,
    req: {
      params: { id: '6b082b84-9d1e-4b6f-a3f1-7dfb85f66d0c' },
      body: { reason: 'short' },
      user: { id: 'admin-1' },
    },
    replace: { target: prisma.document, method: 'findUnique' },
    expectedResponse: {
      error: 'A rejection reason of at least 10 characters is required.',
      code: 'REJECTION_REASON_REQUIRED',
    },
  });
});
