const { z } = require('zod');

// Schema para registro de usuario
const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Phone must use international format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().trim().min(2, 'First name is required').max(80),
  lastName: z.string().trim().min(2, 'Last name is required').max(120),
  role: z.enum(['CLIENT', 'PROFESSIONAL']).default('CLIENT'),
  countryCode: z.enum(['ES', 'BR', 'CL']),
  locale: z.enum(['es', 'en', 'pt']).default('es'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Terms must be accepted' }) }),
  acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'Privacy notice must be acknowledged' }) }),
  marketingConsent: z.boolean().default(false),
  termsVersion: z.literal('2026-08-30'),
  privacyVersion: z.literal('2026-08-30'),
});

// Schema para login
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

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
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  postalCode: z.string().min(5, 'Postal code is required'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().max(500).optional(),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, 'At least one service is required'),
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
};
