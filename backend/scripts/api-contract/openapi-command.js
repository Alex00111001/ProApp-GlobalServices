const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { ROOT } = require('./source-inventory');
const { buildInventory, serialize } = require('./inventory-command');
const { safeErrorSchema } = require('../../src/contracts/error.responses');
const { projectSchema } = require('./schema-catalog');

const OUTPUT = path.join(ROOT, 'docs/api/openapi.v1.candidate.json');
const supported = (route) => route.classification !== 'INTERNAL' && route.classification !== 'REMOVAL_CANDIDATE';
const cleanSchema = (schema) => {
  if (!schema) return {};
  const copy = structuredClone(schema);
  delete copy.$schema;
  return copy;
};
const schemaFor = (document, route, validation) => {
  const entry = document.schemas[`${route.handler.file}#${validation.schema}`];
  const schema = cleanSchema(entry?.jsonSchema);
  if (entry?.gaps?.length) schema['x-homeservices-runtime-semantics'] = entry.gaps;
  schema['x-homeservices-zod-binding'] = `${route.handler.file}#${validation.schema}`;
  return schema;
};
const securityFor = (auth) => ({
  PUBLIC: [], CUSTOMER_BEARER: [{ bearerAuth: [] }], OPTIONAL_CUSTOMER_BEARER: [{}, { bearerAuth: [] }],
  ADMIN_BEARER: [{ adminBearerAuth: [] }], SIGNED_PROVIDER_PAYLOAD: [{ providerSignature: [] }],
  ADMIN_REFRESH_COOKIE_CSRF: [{ adminRefreshCookie: [], adminCsrfHeader: [] }],
}[auth] || []);
const errorResponse = { description: 'Safe error envelope', content: { 'application/json': { schema: { $ref: '#/components/schemas/SafeError' } } } };
const successSchema = (fields) => ({ type: 'object', properties: Object.fromEntries(fields.map((field) => [field, {}])), required: fields, additionalProperties: true,
  'x-homeservices-response-parity': 'PENDING_RUNTIME_OUTPUT_SCHEMA' });

function buildOpenApi(inventoryDocument = buildInventory()) {
  const safeErrorProjection = projectSchema(safeErrorSchema, 'output');
  if (!safeErrorProjection.jsonSchema || safeErrorProjection.gaps.length) throw new Error('Safe error schema is not completely projectable.');
  const paths = {};
  for (const route of inventoryDocument.routes.filter(supported)) {
    const parameters = [];
    let requestBody;
    for (const name of [...route.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])) {
      parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
    for (const validation of route.validation) {
      const schema = schemaFor(inventoryDocument, route, validation);
      if (validation.input.includes('req.body')) {
        const contentType = route.middleware.some((item) => item.startsWith('upload.')) ? 'multipart/form-data' : 'application/json';
        requestBody = { required: !schema.default, content: { [contentType]: { schema } } };
      } else if (validation.input.includes('req.query') && schema.type === 'object') {
        const required = new Set(schema.required || []);
        for (const [name, propertySchema] of Object.entries(schema.properties || {})) {
          parameters.push({ name, in: 'query', required: required.has(name), schema: propertySchema });
        }
      } else if (validation.input.includes('req.params') && schema.type === 'object') {
        for (const parameter of parameters.filter((item) => item.in === 'path')) {
          if (schema.properties?.[parameter.name]) parameter.schema = schema.properties[parameter.name];
        }
      } else if (/req\.params\.([A-Za-z0-9_]+)/.test(validation.input)) {
        const name = validation.input.match(/req\.params\.([A-Za-z0-9_]+)/)[1];
        const parameter = parameters.find((item) => item.in === 'path' && item.name === name);
        if (parameter) parameter.schema = schema;
      }
    }
    const responses = {};
    for (const [status, response] of Object.entries(route.responseAuthority?.responses || {})) {
      responses[status] = response.empty
        ? { description: 'No content' }
        : { description: 'Runtime-authoritative serialized response', content: { 'application/json': { schema: cleanSchema(response.jsonSchema) } },
          'x-homeservices-response-parity': response.wireParity };
    }
    for (const response of route.response) for (const status of response.statuses) {
      const key = String(status);
      if (Number(status) >= 400) responses[key] = errorResponse;
      else if (!responses[key]) {
        const fields = [...new Set([...(responses[key]?.['x-observed-fields'] || []), ...response.fields])].sort();
        responses[key] = { description: 'Observed runtime response', 'x-observed-fields': fields,
          content: { 'application/json': { schema: successSchema(fields) } } };
      }
    }
    responses.default = errorResponse;
    const suffix = createHash('sha256').update(`${route.method} ${route.path}`).digest('hex').slice(0, 10);
    paths[route.path] ||= {};
    paths[route.path][route.method.toLowerCase()] = {
      operationId: `${route.handler.name.replace(/[^A-Za-z0-9_]/g, '_')}_${suffix}`,
      tags: [route.classification], deprecated: route.classification === 'DEPRECATED',
      security: securityFor(route.auth), parameters, ...(requestBody ? { requestBody } : {}), responses,
      'x-homeservices-auth': route.auth, 'x-homeservices-middleware': route.middleware,
      'x-homeservices-consumers': route.consumers, 'x-homeservices-domain-authority': route.domainAuthority,
      'x-homeservices-rate-limit': route.rateLimit, 'x-homeservices-runtime-source': route.registration,
    };
  }
  return {
    openapi: '3.1.0', info: { title: 'HomeServices API v1 candidate', version: '1.0.0-candidate',
      description: 'Generated review candidate. Publication remains blocked until every completeness counter is zero.' },
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    servers: [{ url: '/', description: 'Environment-relative API origin' }],
    tags: ['CANONICAL_V1', 'LEGACY_SUPPORTED', 'ADMIN', 'WEBHOOK', 'DEPRECATED'].map((name) => ({ name })), paths,
    components: { securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      adminBearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      providerSignature: { type: 'apiKey', in: 'header', name: 'stripe-signature' },
      adminRefreshCookie: { type: 'apiKey', in: 'cookie', name: 'admin_refresh' },
      adminCsrfHeader: { type: 'apiKey', in: 'header', name: 'x-admin-csrf-token' },
    }, schemas: { SafeError: cleanSchema(safeErrorProjection.jsonSchema) } },
    'x-homeservices-contract-status': 'CANDIDATE_NOT_PUBLISHED',
    'x-homeservices-completeness': {
      unresolvedConsumerCalls: inventoryDocument.consumers.filter((call) => call.status !== 'PATH_METHOD_MATCH').length,
      unprovenWireSchemas: Object.values(inventoryDocument.schemas).filter((schema) => schema.wireParity !== 'STRUCTURAL').length,
      operationsWithoutCompleteResponseSchema: inventoryDocument.routes.filter(supported).filter((route) => !route.responseAuthority?.complete).length,
    },
  };
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--write', '--check', '--validate'].includes(args[0])) throw new Error('Use --write, --check or --validate.');
  const document = buildOpenApi();
  if (args[0] === '--write') fs.writeFileSync(OUTPUT, serialize(document));
  if (args[0] === '--check' && (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') !== serialize(document))) {
    throw new Error('Generated OpenAPI candidate is stale.');
  }
  if (args[0] === '--validate') await SwaggerParser.validate(document);
  console.log(JSON.stringify({ output: 'docs/api/openapi.v1.candidate.json', openapi: document.openapi,
    paths: Object.keys(document.paths).length, operations: Object.values(document.paths).flatMap(Object.values).length,
    completeness: document['x-homeservices-completeness'], status: document['x-homeservices-contract-status'] }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { OUTPUT, buildOpenApi, main };
