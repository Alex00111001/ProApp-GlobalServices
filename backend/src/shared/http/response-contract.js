const { z } = require('zod');

const RESPONSE_CONTRACT = Symbol.for('homeservices.http.responseContract');

const isZodSchema = (value) => Boolean(value && value._zod && typeof value.safeParse === 'function');

const defineResponseContract = ({ operationId, responses }) => {
  if (!operationId || typeof operationId !== 'string') throw new TypeError('A stable response-contract operationId is required.');
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) throw new TypeError('Response contracts require a status map.');

  const normalized = {};
  for (const [statusValue, definition] of Object.entries(responses)) {
    const status = Number(statusValue);
    if (!Number.isInteger(status) || status < 200 || status >= 400) {
      throw new TypeError(`Response contract ${operationId} has an invalid success status: ${statusValue}.`);
    }
    if (definition === null) {
      if (status !== 204) throw new TypeError(`Only 204 may use an empty response contract (${operationId}).`);
      normalized[status] = null;
      continue;
    }
    if (!isZodSchema(definition)) throw new TypeError(`Response contract ${operationId} status ${status} is not a Zod schema.`);
    normalized[status] = definition;
  }
  if (!Object.keys(normalized).length) throw new TypeError(`Response contract ${operationId} has no success responses.`);
  return Object.freeze({ operationId, responses: Object.freeze(normalized) });
};

const responseContract = (contract) => {
  if (!contract?.operationId || !contract.responses) throw new TypeError('A defined response contract is required.');
  const middleware = (req, res, next) => {
    res.locals[RESPONSE_CONTRACT] = contract;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let serializingJson = false;

    res.json = (body) => {
      if (res.statusCode >= 400) return originalJson(body);
      const schema = contract.responses[res.statusCode];
      if (!schema) throw Object.assign(new Error(`Undeclared success status ${res.statusCode} for ${contract.operationId}.`), {
        code: 'RESPONSE_CONTRACT_STATUS_MISMATCH', statusCode: 500,
      });
      const result = schema.safeParse(body);
      if (!result.success) throw Object.assign(new Error(`Response serialization failed for ${contract.operationId}.`), {
        code: 'RESPONSE_CONTRACT_VIOLATION', statusCode: 500, cause: result.error,
      });
      serializingJson = true;
      try { return originalJson(result.data); }
      finally { serializingJson = false; }
    };

    res.send = (body) => {
      if (serializingJson) return originalSend(body);
      if (res.statusCode >= 400) return originalSend(body);
      const schema = contract.responses[res.statusCode];
      if (schema === undefined) throw Object.assign(new Error(`Undeclared success status ${res.statusCode} for ${contract.operationId}.`), {
        code: 'RESPONSE_CONTRACT_STATUS_MISMATCH', statusCode: 500,
      });
      if (schema === null) {
        if (body !== undefined && body !== null && body !== '') throw Object.assign(new Error(`Expected an empty response for ${contract.operationId}.`), {
          code: 'RESPONSE_CONTRACT_VIOLATION', statusCode: 500,
        });
        return originalSend();
      }
      throw Object.assign(new Error(`Direct body send bypasses JSON serialization for ${contract.operationId}.`), {
        code: 'RESPONSE_CONTRACT_VIOLATION', statusCode: 500,
      });
    };
    next();
  };
  middleware[RESPONSE_CONTRACT] = contract;
  return middleware;
};

const outputObject = (shape) => z.object(shape);

module.exports = { RESPONSE_CONTRACT, defineResponseContract, outputObject, responseContract };
