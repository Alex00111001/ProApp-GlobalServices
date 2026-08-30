const { z } = require('zod');
const { LEGAL_DOCUMENT_VERSION } = require('../config/business');
const cleanText = (value) => value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
const safeText = (min, max) => z.string().transform(cleanText).pipe(z.string().min(min).max(max));

// Schema para registro de usuario
const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Phone must use international format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: safeText(2, 80),
  lastName: safeText(2, 120),
  role: z.enum(['CLIENT', 'PROFESSIONAL']).default('CLIENT'),
  countryCode: z.enum(['ES', 'BR', 'CL']),
  locale: z.enum(['es', 'en', 'pt']).default('es'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Terms must be accepted' }) }),
  acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'Privacy notice must be acknowledged' }) }),
  marketingConsent: z.boolean().default(false),
  termsVersion: z.literal(LEGAL_DOCUMENT_VERSION),
  privacyVersion: z.literal(LEGAL_DOCUMENT_VERSION),
});

// Schema para login
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const optionalText = (max) => z.string().transform(cleanText).pipe(z.string().max(max)).optional();
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
  newPassword: z.string().min(8).max(200),
}).strict();

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
  bio: z.string().max(500).optional(),
  yearsOfExperience: z.number().int().positive().optional(),
  hourlyRate: z.number().positive().optional(),
  serviceRadius: z.number().int().positive().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  categoryIds: z.array(z.string()).optional(),
});

// Schema para crear reserva
const createBookingSchema = z.object({
  professionalId: z.string().uuid('Invalid professional ID'),
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
};
