const assert = require('node:assert/strict');
const test = require('node:test');
const Ajv = require('ajv/dist/2020');
const { bookingCancellationBody, bookingRejectionBody } = require('../src/validators/legacy-request.validators');
const { projectSchema } = require('../scripts/api-contract/schema-catalog');

for (const [name, schema] of [['cancel', bookingCancellationBody], ['reject', bookingRejectionBody]]) {
  test(`${name} wire acceptance projects without hiding normalization`, () => {
    const projection = projectSchema(schema);
    assert.equal(projection.classification, 'NORMALIZATION');
    assert.notEqual(projection.wireParity, 'STRUCTURAL');
    assert.ok(projection.gaps.length > 0);
    assert.equal(projection.bodyRequired, false, 'body is optional');
    const validate = new Ajv({ strict: false }).compile(projection.jsonSchema);
    for (const value of [{}, { reason: null }, { reason: '' }, { reason: ' a ' },
      { reason: 'x'.repeat(600) }, { reason: '\u0000' }, { extra: 'discarded' },
      { reason: 2 }, { reason: [] }, [], null, 'text', false]) {
      assert.equal(validate(value), schema.safeParse(value).success, JSON.stringify(value));
    }
    assert.deepEqual(schema.parse(undefined), { reason: null });
    assert.deepEqual(schema.parse({ reason: null, extra: true }), { reason: null });
    assert.deepEqual(schema.parse({ reason: ` ${'x'.repeat(600)} `, extra: true }), { reason: 'x'.repeat(500) });
  });
}
