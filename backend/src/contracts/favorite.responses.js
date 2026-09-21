const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { catalogSchemas } = require('./catalog.responses');
const { dateTime, pagination } = require('./shared.responses');

const uuid = z.string().uuid();
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const favoriteProfessional = outputObject({
  id: uuid, userId: uuid, status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE']),
  bio: z.string().nullable(), yearsOfExperience: z.number().int().nullable(), hourlyRate: decimal.nullable(),
  serviceRadius: z.number().int().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable(),
  totalBookings: z.number().int().nonnegative(), averageRating: z.number(), totalReviews: z.number().int().nonnegative(),
  verifiedAt: dateTime.nullable(), createdAt: dateTime, updatedAt: dateTime,
  user: outputObject({ id: uuid, firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable() }),
  categories: z.array(outputObject({
    id: uuid, professionalId: uuid, categoryId: uuid, yearsInCategory: z.number().int().nullable(),
    verified: z.boolean(), createdAt: dateTime, category: catalogSchemas.category,
  })),
  services: z.array(catalogSchemas.service),
});
const favoriteState = outputObject({ isFavorite: z.boolean() });
const contract = (method, path, operationId, responses) => defineResponseContract({ method, path, operationId, responses });

const favoriteResponses = Object.freeze({
  list: contract('GET', '/api/favorites', 'favorites.list', { 200: serialized(outputObject({ favorites: z.array(favoriteProfessional), pagination })) }),
  add: contract('POST', '/api/favorites', 'favorites.add', { 201: serialized(outputObject({ favorite: favoriteProfessional, isFavorite: z.literal(true) })) }),
  toggle: contract('POST', '/api/favorites/toggle', 'favorites.toggle', { 200: favoriteState, 201: favoriteState }),
  remove: contract('DELETE', '/api/favorites/{professionalId}', 'favorites.remove', { 200: favoriteState }),
  check: contract('GET', '/api/favorites/check/{professionalId}', 'favorites.check', { 200: favoriteState }),
});

module.exports = { favoriteResponses, favoriteSchemas: { favoriteProfessional } };
