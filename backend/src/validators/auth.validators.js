const { z } = require('zod');
const { annotateInputSemantics, declareInputContract } = require('../shared/http/input-contract');
const { normalizeBookingPayload } = require('../shared/http/compatibility');
const { LEGAL_DOCUMENT_VERSION } = require('../config/business');
const { enforceFieldRules } = require('../shared/http/field-rules');
const registrationFieldRules = Object.freeze([
  Object.freeze({ kind: 'REQUIRED_WHEN_TRUE', flag: 'marketingConsent', fields: Object.freeze(['marketingPolicyId', 'marketingPolicyVersion']),
    issuePath: 'marketingPolicyId', message: 'An effective marketing policy id and version are required.' }),
  Object.freeze({ kind: 'TOGETHER', fields: Object.freeze(['marketingPolicyId', 'marketingPolicyVersion']),
    issuePath: 'marketingPolicyVersion', message: 'Marketing policy id and version must be supplied together.' }),
]);
const cleanText = (value) => value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
const textSemantics = { classes: ['NORMALIZATION'], transformClassification: 'NORMALIZATION',
  evidence: ['backend/test/input-authority.test.js'], semantics: ['Control/whitespace cleanup preserves string representation; normalized bounds remain runtime-enforced'] };
const safeText = (min, max) => annotateInputSemantics(z.string().transform(cleanText).pipe(z.string().min(min).max(max)), textSemantics);

// Schema para registro de usuario
const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Phone must use international format'),
  password: z.string().min(12, 'Password must be at least 12 characters').max(200),
  firstName: safeText(2, 80),
  lastName: safeText(2, 120),
  role: z.enum(['CLIENT', 'PROFESSIONAL']).default('CLIENT'),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  marketCode: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,15}$/).optional(),
  registrationSchemaVersion: z.string().trim().min(5).max(120).optional(),
  identityDocument: z.object({
    type: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
    value: z.string().trim().min(5).max(64),
  }).strict().optional(),
  normalizedAddress: z.object({
    line1: safeText(1, 200),
    line2: safeText(1, 200).optional(),
    locality: safeText(1, 120).optional(),
    postalCode: safeText(1, 32).optional(),
    divisionIds: z.array(z.string().uuid()).min(1).max(12),
  }).strict().optional(),
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).default('es'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Terms must be accepted' }) }),
  acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'Privacy notice must be acknowledged' }) }),
  marketingConsent: z.boolean().default(false),
  marketingPolicyId: z.uuid().optional(),
  marketingPolicyVersion: z.number().int().positive().optional(),
  termsVersion: z.literal(LEGAL_DOCUMENT_VERSION),
  privacyVersion: z.literal(LEGAL_DOCUMENT_VERSION),
}).strict().superRefine((value, context) => {
  enforceFieldRules(value, context, registrationFieldRules);
});

// Schema para login
annotateInputSemantics(registerSchema, {
  fieldRules: registrationFieldRules,
  classes: ['CROSS_FIELD_VALIDATION', 'REFINEMENT'], evidence: ['backend/test/input-authority.test.js'],
  semantics: ['Marketing consent requires policy id/version together', 'Supplying either policy id or version requires the other'],
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const optionalText = (max) => annotateInputSemantics(z.string().transform(cleanText).pipe(z.string().max(max)).optional(), textSemantics);
const updateProfileSchema = z.object({
  firstName: optionalText(80),
  lastName: optionalText(120),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).optional(),
  avatarUrl: z.string().trim().url().max(2048).optional(),
  address: optionalText(240),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(80),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
}).strict();

const refreshSessionSchema = z.object({
  refreshToken: z.string().min(32).max(256),
}).strict();

const passwordRecoveryRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).optional(),
}).strict();
const emailWire = z.string();
for (const [schema, id, wire] of [
  [loginSchema, 'identity.login', z.object({ email: emailWire, password: loginSchema.shape.password }).passthrough()],
  [passwordRecoveryRequestSchema, 'identity.recovery', z.object({ email: emailWire, locale: z.string().optional() }).strict()],
]) declareInputContract(schema, {
  schema: wire, classification: 'NORMALIZATION', classes: ['NORMALIZATION', 'REFINEMENT'],
  projectionKind: 'STRUCTURAL_WITH_RUNTIME_REFINEMENT', parityMode: 'STRUCTURAL_WITH_RUNTIME_REFINEMENT',
  evidenceId: id, evidence: ['backend/test/input-authority.test.js'],
  semantics: ['Email is trimmed/lowercased before email validation; wire whitespace/case is accepted',
    ...(id === 'identity.login' ? ['Unknown fields are accepted and stripped']
      : ['Unknown fields are rejected', 'Locale is trimmed before syntax and length validation'])],
});
const passwordResetSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(12).max(200),
}).strict();
const accountActionConfirmSchema = z.object({ token: z.string().min(32).max(256) }).strict();

// Schema para perfil de cliente
const clientProfileSchema = z.object({
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default('MX'),
  postalCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

// Schema para perfil de profesional
const professionalProfileSchema = z.object({
  bio: optionalText(500),
  yearsOfExperience: z.number().int().min(0).max(100).optional(),
  hourlyRate: z.number().positive().max(1_000_000).optional(),
  serviceRadius: z.number().int().positive().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  categoryIds: z.array(z.string().uuid()).max(50).optional(),
}).strict();

// Schema para crear reserva
const createBookingSchema = z.object({
  professionalId: z.string().uuid('Invalid professional ID'),
  addressId: z.string().uuid().optional(),
  scheduledDate: z.string().datetime('Invalid date format'),
  address: safeText(5, 240),
  city: safeText(2, 100),
  state: safeText(2, 100),
  postalCode: safeText(3, 20),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: optionalText(500),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    quantity: z.number().int().positive(),
  }).strict()).min(1, 'At least one service is required').max(50),
}).strict();
// This structural subset deliberately does not claim post-normalization/domain equivalence.
// Aliases are discarded even when their values are ignored by a canonical value.
const bookingCreateWireSchema = z.object({
  ...createBookingSchema.shape,
  scheduledDate: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  address: z.string(), city: z.string(), state: z.string(),
  postalCode: z.string().nullable().optional(), notes: z.string().optional(),
  zipCode: z.unknown().optional(), scheduledTime: z.unknown().optional(),
}).strict();
declareInputContract(createBookingSchema, {
  schema: bookingCreateWireSchema, classification: 'LEGACY_COMPATIBILITY',
  classes: ['LEGACY_COMPATIBILITY', 'NORMALIZATION', 'TRANSFORM', 'REFINEMENT', 'RUNTIME_DERIVED'],
  projectionKind: 'STRUCTURAL_WITH_RUNTIME_REFINEMENT', parityMode: 'STRUCTURAL_WITH_RUNTIME_REFINEMENT',
  runtimeExpression: 'normalizeBookingPayload(req.body)',
  parseWire: (value) => createBookingSchema.parse(normalizeBookingPayload(value)),
  evidenceId: 'booking.create', evidence: ['backend/test/input-authority.test.js', 'backend/test/booking-mutation-consumer-parity.test.js', 'backend/test/integration/booking-transition-postgres.test.js'],
  semantics: ['zipCode is a supported fallback for postalCode; canonical non-null postalCode wins',
    'scheduledTime is a supported local-time alias; date normalization uses the existing server timezone',
    'Address/text controls and whitespace are normalized before length validation',
    'Future scheduling, service duration/ownership, approved professional, owned address/market and commercial policy are runtime prerequisites',
    'Actor, currency, prices, role and market authority cannot be assigned through the strict client body'],
});

// Schema para review
const reviewSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
  rating: z.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
  comment: z.string().max(500).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  clientProfileSchema,
  professionalProfileSchema,
  createBookingSchema,
  reviewSchema,
  updateProfileSchema,
  changePasswordSchema,
  refreshSessionSchema,
  passwordRecoveryRequestSchema,
  passwordResetSchema,
  accountActionConfirmSchema,
};
