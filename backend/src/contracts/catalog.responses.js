const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime, messageResponse } = require('./shared.responses');

const uuid = z.string().uuid();
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const category = outputObject({
  id: uuid, name: z.string(), slug: z.string(), description: z.string().nullable(), iconUrl: z.string().nullable(),
  isActive: z.boolean(), createdAt: dateTime, updatedAt: dateTime,
});
const subcategory = outputObject({
  id: uuid, name: z.string(), slug: z.string(), categoryId: uuid, description: z.string().nullable(),
  isActive: z.boolean(), createdAt: dateTime, updatedAt: dateTime,
});
const service = outputObject({
  id: uuid, name: z.string(), description: z.string().nullable(), basePrice: decimal, duration: z.number().int().nonnegative(),
  categoryId: uuid, subcategoryId: uuid.nullable(), professionalId: uuid.nullable(), isActive: z.boolean(),
  createdAt: dateTime, updatedAt: dateTime,
});
const publicUserName = outputObject({ firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable() });
const publicProfessional = outputObject({
  id: uuid, userId: uuid, status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE']),
  bio: z.string().nullable(), yearsOfExperience: z.number().int().nullable(), hourlyRate: decimal.nullable(),
  serviceRadius: z.number().int().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable(),
  totalBookings: z.number().int().nonnegative(), averageRating: z.number(), totalReviews: z.number().int().nonnegative(),
  verifiedAt: dateTime.nullable(), createdAt: dateTime, updatedAt: dateTime, user: publicUserName.optional(),
});
const professionalCategory = outputObject({
  id: uuid, professionalId: uuid, categoryId: uuid, yearsInCategory: z.number().int().nullable(),
  verified: z.boolean(), createdAt: dateTime, professional: publicProfessional,
});
const serviceDetail = service.extend({
  category, subcategory: subcategory.nullable(), professional: publicProfessional.nullable(),
});
const categoryListItem = category.extend({
  subcategories: z.array(subcategory), _count: outputObject({ professionals: z.number().int().nonnegative() }),
});
const categoryDetail = category.extend({
  subcategories: z.array(subcategory), professionals: z.array(professionalCategory), services: z.array(service).max(10),
});
const contract = (method, path, operationId, status, schema) => defineResponseContract({
  method, path, operationId, responses: { [status]: serialized(schema) },
});

const catalogResponses = Object.freeze({
  getCategories: contract('GET', '/api/categories', 'catalog.categories.list', 200, outputObject({ categories: z.array(categoryListItem) })),
  getServiceById: contract('GET', '/api/categories/services/{id}', 'catalog.service.get', 200, outputObject({ service: serviceDetail })),
  getCategoryById: contract('GET', '/api/categories/{id}', 'catalog.category.get', 200, outputObject({ category: categoryDetail })),
  createCategory: contract('POST', '/api/categories', 'catalog.category.create', 201, outputObject({ message: z.string(), category })),
  updateCategory: contract('PUT', '/api/categories/{id}', 'catalog.category.update', 200, outputObject({ message: z.string(), category })),
  deleteCategory: contract('DELETE', '/api/categories/{id}', 'catalog.category.deactivate', 200, messageResponse),
});

module.exports = { catalogResponses, catalogSchemas: { category, categoryDetail, categoryListItem, publicProfessional, service, serviceDetail, subcategory } };
