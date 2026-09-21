const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime, pagination } = require('./shared.responses');

const uuid = z.string().uuid();
const bookingReference = outputObject({
  id: uuid,
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  scheduledDate: dateTime,
});
const notification = outputObject({
  id: uuid, userId: uuid, bookingId: uuid.nullable(), type: z.enum([
    'BOOKING_REQUEST', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'PAYMENT_RECEIVED', 'REMINDER', 'PROMOTION', 'SYSTEM',
  ]),
  title: z.string(), message: z.string(), data: z.json().nullable(), isRead: z.boolean(), readAt: dateTime.nullable(),
  createdAt: dateTime, booking: bookingReference.nullable().optional(),
});
const successMessage = outputObject({ success: z.literal(true), message: z.string() });
const contract = (method, path, operationId, schema) => defineResponseContract({
  method, path, operationId, responses: { 200: serialized(schema) },
});

const notificationResponses = Object.freeze({
  list: contract('GET', '/api/notifications', 'notifications.list', outputObject({
    success: z.literal(true), notifications: z.array(notification), unreadCount: z.number().int().nonnegative(), pagination,
  })),
  markReadPut: contract('PUT', '/api/notifications/{notificationId}/read', 'notifications.markRead.put', outputObject({ success: z.literal(true), notification })),
  markReadPatch: contract('PATCH', '/api/notifications/{notificationId}/read', 'notifications.markRead.patch', outputObject({ success: z.literal(true), notification })),
  markAllReadPut: contract('PUT', '/api/notifications/read-all', 'notifications.markAllRead.put', successMessage),
  markAllReadPatch: contract('PATCH', '/api/notifications/read-all', 'notifications.markAllRead.patch', successMessage),
  delete: contract('DELETE', '/api/notifications/{notificationId}', 'notifications.delete', successMessage),
});

module.exports = { notificationResponses, notificationSchemas: { notification } };
