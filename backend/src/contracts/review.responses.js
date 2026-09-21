const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime, pagination } = require('./shared.responses');

const uuid = z.string().uuid();
const review = outputObject({
  id: uuid, bookingId: uuid, rating: z.number().int().min(1).max(5), comment: z.string().nullable(),
  response: z.string().nullable(), responseAt: dateTime.nullable(), createdAt: dateTime, updatedAt: dateTime,
  client: outputObject({ id: uuid, firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable() }),
  booking: outputObject({
    id: uuid,
    bookingServices: z.array(outputObject({ service: outputObject({ id: uuid, name: z.string() }) })),
  }),
});
const collection = outputObject({ success: z.literal(true), reviews: z.array(review), pagination });
const contract = (method, path, operationId, status, schema) => defineResponseContract({
  method, path, operationId, responses: { [status]: serialized(schema) },
});
const reviewResponses = Object.freeze({
  professional: contract('GET', '/api/reviews/professional/{professionalId}', 'reviews.professional.list', 200,
    collection.extend({ averageRating: z.number().min(0).max(5), reviewCount: z.number().int().nonnegative() })),
  create: contract('POST', '/api/reviews', 'reviews.create', 201, outputObject({ success: z.literal(true), review })),
  respond: contract('PUT', '/api/reviews/{reviewId}/respond', 'reviews.respond', 200, outputObject({ success: z.literal(true), review })),
  mine: contract('GET', '/api/reviews/my-reviews', 'reviews.mine', 200, collection),
});

module.exports = { reviewResponses, reviewSchemas: { review } };
