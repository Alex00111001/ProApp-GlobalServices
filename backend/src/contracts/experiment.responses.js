const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime } = require('./shared.responses');

const uuid = z.string().uuid();
const assignment = outputObject({
  assignmentId: uuid,
  experiment: z.string(),
  version: z.number().int().positive(),
  variant: outputObject({ key: z.string(), payload: z.json() }),
  assignedAt: dateTime,
});
const exposure = outputObject({
  id: uuid,
  eventId: uuid,
  assignmentId: uuid,
  surface: z.string(),
  context: z.json().nullable(),
  exposedAt: dateTime,
});

const experimentResponses = Object.freeze({
  assign: defineResponseContract({
    method: 'POST', path: '/api/v1/experiments/{key}/assignments', operationId: 'experiments.assign',
    responses: { 200: serialized(assignment) },
  }),
  expose: defineResponseContract({
    method: 'POST', path: '/api/v1/experiments/{key}/exposures', operationId: 'experiments.expose',
    responses: { 201: serialized(outputObject({ exposure, duplicate: z.boolean() })) },
  }),
});

module.exports = { experimentResponses, experimentSchemas: { assignment, exposure } };
