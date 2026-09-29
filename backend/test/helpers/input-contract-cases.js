const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const booking = { professionalId: uuid, services: [{ serviceId: uuid, quantity: 1 }],
  scheduledDate: '2030-10-01T10:00:00.000Z', address: 'Calle Mayor 1', city: 'Madrid', state: 'Madrid', postalCode: '28001' };
const sample = (name, value, accepted, extra = {}) => ({ name, value, accepted, ...extra });
const reasonCases = [
  sample('absent body', undefined, true, { expected: { reason: null } }),
  sample('empty object', {}, true, { expected: { reason: null } }),
  sample('null reason', { reason: null }, true, { expected: { reason: null } }),
  sample('trim reason', { reason: '  Cancel  ', role: 'ADMIN' }, true, { expected: { reason: 'Cancel' } }),
  ...[0, 1, 499, 500, 501, 1200].map((n) => sample(`reason boundary ${n}`, { reason: ` ${'x'.repeat(n)} ` }, true, { expected: { reason: 'x'.repeat(Math.min(n, 500)) } })),
  ...[null, [], '', 1, true, { reason: false }, { reason: [] }, { reason: {} }].map((value, i) => sample(`invalid reason ${i}`, value, false)),
];
const bookingCases = [
  sample('canonical', booking, true, { expected: booking }),
  sample('legacy postal alias', { ...booking, postalCode: undefined, zipCode: '28001' }, true, { expected: booking }),
  sample('canonical wins ignored alias', { ...booking, zipCode: { ignored: true } }, true, { expected: booking }),
  sample('null canonical uses alias', { ...booking, postalCode: null, zipCode: '28001' }, true, { expected: booking }),
  sample('text before normalized maximum', { ...booking, city: ` ${'x'.repeat(100)} ` }, true, { expected: { ...booking, city: 'x'.repeat(100) } }),
  sample('control text transformation', { ...booking, address: 'Calle\u0000  Mayor 1' }, true, { expected: booking }),
  sample('legacy schedule', { ...booking, scheduledTime: '11:30' }, true),
  sample('legacy numeric schedule', { ...booking, scheduledDate: new Date(booking.scheduledDate).getTime(), scheduledTime: '11:30' }, true),
  sample('legacy array schedule', { ...booking, scheduledDate: [booking.scheduledDate], scheduledTime: '11:30' }, true),
  sample('ignored invalid schedule alias', { ...booking, scheduledTime: {} }, true, { expected: booking }),
  sample('missing postal', { ...booking, postalCode: undefined }, false, { refinement: 'Canonical or fallback postalCode must satisfy normalized length.' }),
  sample('invalid normalized text', { ...booking, city: ' '.repeat(40) }, false, { refinement: 'Minimum applies after text normalization.' }),
  sample('invalid normalized date', { ...booking, scheduledDate: 'not-a-date' }, false, { refinement: 'Result must be canonical datetime.' }),
  sample('invalid service quantity', { ...booking, services: [{ serviceId: uuid, quantity: 0 }] }, false),
  sample('null notes', { ...booking, notes: null }, false),
  ...['clientId', 'actorUserId', 'role', 'marketId', 'currency', 'totalPrice', 'permissions', '__proto__', 'constructor'].map((key) =>
    sample(`spoof ${key}`, JSON.parse(JSON.stringify({ ...booking, [key]: 'spoofed' })), false)),
];
const emailCases = (recovery) => [
  sample('canonical email', recovery ? { email: 'person@example.invalid' } : { email: 'person@example.invalid', password: 'not-a-secret' }, true),
  sample('normalized email', recovery ? { email: ' PERSON@EXAMPLE.INVALID ' } : { email: ' PERSON@EXAMPLE.INVALID ', password: 'not-a-secret', role: 'ADMIN' }, true,
    { expected: recovery ? { email: 'person@example.invalid' } : { email: 'person@example.invalid', password: 'not-a-secret' } }),
  sample('invalid email refinement', recovery ? { email: 'invalid' } : { email: 'invalid', password: 'not-a-secret' }, false, { refinement: 'Email validated after trim/lowercase.' }),
  sample('wrong wire type', { email: null, password: 'not-a-secret' }, false),
  sample('missing required email', recovery ? {} : { password: 'not-a-secret' }, false),
  ...(recovery ? [sample('locale normalization', { email: 'person@example.invalid', locale: ' es ' }, true, { expected: { email: 'person@example.invalid', locale: 'es' } }),
    sample('locale refinement', { email: 'person@example.invalid', locale: 'invalid_locale' }, false, { refinement: 'Locale grammar is checked after trim.' }),
    sample('identity injection', { email: 'person@example.invalid', actorUserId: 'spoofed' }, false)] : [sample('empty password', { email: 'person@example.invalid', password: '' }, false)]),
];
const paymentCases = [
  sample('provider id normalized', { bookingId: uuid, paymentIntentId: ' pi_example123 ' }, true, { expected: { bookingId: uuid, paymentIntentId: 'pi_example123' } }),
  sample('provider prefix invalid', { bookingId: uuid, paymentIntentId: 'other' }, false, { refinement: 'Provider-id grammar.' }),
  sample('provider maximum invalid', { bookingId: uuid, paymentIntentId: `pi_${'x'.repeat(253)}` }, false, { refinement: 'Normalized maximum length 255.' }),
  sample('provider exact maximum', { bookingId: uuid, paymentIntentId: `pi_${'x'.repeat(252)}` }, true),
  sample('provider padded maximum', { bookingId: uuid, paymentIntentId: ` pi_${'x'.repeat(252)} ` }, true,
    { expected: { bookingId: uuid, paymentIntentId: `pi_${'x'.repeat(252)}` } }),
  sample('provider wrong type', { bookingId: uuid, paymentIntentId: false }, false),
  sample('money manipulation', { bookingId: uuid, paymentIntentId: 'pi_example123', amount: 1 }, false),
  sample('currency manipulation', { bookingId: uuid, paymentIntentId: 'pi_example123', currency: 'EUR' }, false),
  sample('actor manipulation', { bookingId: uuid, paymentIntentId: 'pi_example123', userId: uuid }, false),
  ...['\t', '\n', '\u00a0', '\ufeff', '\u2028'].map((padding, i) => sample(`provider whitespace ${i}`,
    { bookingId: uuid, paymentIntentId: `${padding}pi_example123${padding}` }, true, { expected: { bookingId: uuid, paymentIntentId: 'pi_example123' } })),
  ...Array.from({ length: 128 }, (_, code) => String.fromCharCode(code)).map((character, i) => sample(`provider ASCII ${i}`,
    { bookingId: uuid, paymentIntentId: `pi_${character}X` }, /^[A-Za-z0-9]$/.test(character))),
];
module.exports = { uuid, booking, reasonCases, bookingCases, emailCases, paymentCases, sample };
