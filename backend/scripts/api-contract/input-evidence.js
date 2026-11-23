const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { projectSchema, resolveRuntimeSchema } = require('./schema-catalog');
const { verifyRequestCases, verifyEvidenceReferences } = require('./request-parity');
const { reasonCases, bookingCases, emailCases, paymentCases } = require('../../test/helpers/input-contract-cases');

// Executable test inputs, not OpenAPI examples or evidence assertions supplied by a client.
const { normalizationCases } = require('../../test/helpers/normalization-cases');
const supportCase = { subject: 'New request', description: 'A synthetic support request', category: 'OTHER' };
const CASES = Object.freeze({
  'booking.reason': reasonCases, 'booking.create': bookingCases,
  'identity.login': emailCases(false), 'identity.recovery': emailCases(true), 'payment.confirm': paymentCases,
  'support.case-create': [
    { name: 'default priority', value: supportCase, accepted: true, expected: { ...supportCase, priority: 'MEDIUM' } },
    { name: 'trimmed maximum and ignored extra', value: {
      ...supportCase, subject: `  ${'x'.repeat(200)} `, description: `  ${'y'.repeat(10_000)} `,
      priority: 'HIGH', ignored: true,
    }, accepted: true, expected: { ...supportCase, subject: 'x'.repeat(200), description: 'y'.repeat(10_000), priority: 'HIGH' } },
    { name: 'minimum Unicode text', value: { ...supportCase, subject: ' 🙂🙂🙂🙂🙂 ', description: ' 0123456789 ' },
      accepted: true, expected: { ...supportCase, subject: '🙂🙂🙂🙂🙂', description: '0123456789', priority: 'MEDIUM' } },
    ...[
      { subject: ' abcd ' }, { subject: 'x'.repeat(201) }, { description: ' 123456789 ' },
      { description: 'x'.repeat(10_001) }, { priority: null }, { priority: 'high' }, { category: 'INVALID' },
    ].map((override, index) => ({ name: `invalid support input ${index + 1}`, value: { ...supportCase, ...override }, accepted: false })),
  ],
});
function verifyDeclaredAuthority(document) {
  const verified = new Map();
  for (const route of document.routes) for (const validation of route.validation) {
    const key = `${route.handler.file}#${validation.schema}`;
    const entry = document.schemas[key];
    if (!entry?.classification || verified.has(key)) continue;
    verifyEvidenceReferences(entry);
    const schema = resolveRuntimeSchema(route, validation);
    assert.equal(schema.homeservicesWireContract?.evidenceId, entry.evidenceId, 'Mounted validator differs from declared evidence.');
    if (entry.runtimeExpression) assert.equal(entry.runtimeExpression, validation.input, 'Mounted runtime adapter differs from declared wire adapter.');
    const cases = entry.evidenceId?.startsWith('trim.') ? normalizationCases(schema, entry.evidenceId) : CASES[entry.evidenceId];
    assert.ok(cases, `Input contract has no executable semantic cases: ${entry.evidenceId}`);
    const projection = projectSchema(schema);
    assert.deepEqual(projection.jsonSchema, entry.wireJsonSchema, 'Declared wire projection differs from runtime metadata.');
    const result = verifyRequestCases({ schema, cases, projectedSchema: entry.wireJsonSchema });
    const normalizationResults = cases.filter((c) => c.accepted && Object.hasOwn(c, 'expected')).length;
    assert.ok(normalizationResults > 0, 'Declared semantics need checked domain-result evidence, not acceptance alone.');
    entry.semanticEvidence = { ...result, normalizationResults,
      caseDigest: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
      inputSurfaceResolved: result.parityMode === 'ACCEPTANCE_EQUIVALENT', scope: 'VALIDATOR_INPUT_ONLY_NOT_AUTH_OR_DOMAIN_PROOF' };
    verified.set(key, entry.semanticEvidence);
  }
  return verified;
}
const unresolvedInput = (entry) => !entry || !(entry.semanticEvidence?.inputSurfaceResolved
  || (entry.wireParity === 'STRUCTURAL' && !entry.semanticReviewRequired));
module.exports = { verifyDeclaredAuthority, unresolvedInput };
