const path = require('node:path');
const { createHash } = require('node:crypto');
const { ROOT, readSource, walk } = require('./source-inventory');

const REQUEST_EVIDENCE = Object.freeze([
  ['Customer mobile', 'mobile-client/src/services/api.ts', 'createBooking', 'POST /api/bookings'],
  ['Customer mobile', 'mobile-client/src/services/api.ts', 'cancelBooking', 'POST /api/bookings/{id}/cancel'],
  ['Customer mobile', 'mobile-client/src/services/api.ts', 'login', 'POST /api/auth/login'],
  ['Customer mobile', 'mobile-client/src/services/api.ts', 'confirmPayment', 'POST /api/payments/confirm'],
  ['Professional mobile', 'mobile-professional/src/services/api.ts', 'login', 'POST /api/auth/login'],
  ...['confirm', 'reject', 'start', 'complete', 'cancel'].map((action) => ['Professional mobile', 'mobile-professional/src/services/api.ts', `${action}Booking`, `POST /api/bookings/{id}/${action}`]),
  ['Professional mobile', 'mobile-professional/src/services/api.ts', 'bookings', 'GET /api/bookings/professional/my-bookings'],
].map(([consumer, file, method, operation]) => Object.freeze({ consumer, file, method, operation })));

function consumerMethod(entry, context = readSource(path.join(ROOT, entry.file))) {
  const matches = [];
  walk(context.ast, (node) => {
    if (['ClassMethod', 'ObjectMethod'].includes(node.type) && node.key.name === entry.method) matches.push(node);
  });
  if (matches.length !== 1) throw new Error(`Consumer method needs unique review: ${entry.file}#${entry.method}`);
  return { node: matches[0], source: context.text(matches[0]) };
}

function requestEvidenceForCall(call, context) {
  const entry = REQUEST_EVIDENCE.find((item) => item.consumer === call.consumer && item.file === call.file && item.operation === call.operation
    && (() => { const { node } = consumerMethod(item, context); return call.line >= node.loc.start.line && call.line <= node.loc.end.line; })());
  if (!entry) return null;
  const { source } = consumerMethod(entry, context);
  return { status: 'EXECUTABLE_REQUEST_CASES_DECLARED_NOT_GLOBAL_PARITY', method: entry.method,
    sourceDigest: createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex'),
    scope: 'REQUEST_ONLY', evidence: 'backend/test/consumer-request-input.test.js' };
}
module.exports = { REQUEST_EVIDENCE, consumerMethod, requestEvidenceForCall };
