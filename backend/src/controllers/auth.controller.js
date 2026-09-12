const prisma = require('../config/prisma');
const { z } = require('zod');
const { logError } = require('../modules/observability/safe-log');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  accountActionConfirmSchema,
  changePasswordSchema,
  loginSchema,
  passwordRecoveryRequestSchema,
  passwordResetSchema,
  refreshSessionSchema,
  registerSchema,
  updateProfileSchema,
} = require('../validators/auth.validators');
const { normalizeRegistrationPayload } = require('../shared/http/compatibility');
const env = require('../config/env');
const { recordDecision } = require('../modules/privacy/consent.service');
const { assertAddressPolicyInput, assertCurrentSchema, resolveMarketPolicy, validateDivisionHierarchy } = require('../modules/markets/market.service');
const { canonicalType, validateIdentityDocument } = require('../modules/markets/identity-adapters');
const { protectIdentityValue } = require('../modules/markets/identity-protection');
const { writeAuditLog } = require('../modules/audit/audit.service');
const {
  createCustomerSessionInTransaction,
  listCustomerSessions,
  refreshCustomerSession,
  revokeAllCustomerSessionsInTransaction,
  revokeCustomerSession,
} = require('../modules/identity/customer-session.service');
const {
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} = require('../modules/identity/account-action.service');
const { NotificationService } = require('../modules/notifications/notification.service');

const DUMMY_PASSWORD_HASH = '$2b$12$wkoWUlaQnGviXbjEqvHrkeuD0QEIyDxGmt8f8vHhE4mClLkrkHDKi';
const notificationService = new NotificationService();

// Registrar usuario
exports.register = async (req, res) => {
  try {
    // Validar datos de entrada
    const validatedData = registerSchema.parse(normalizeRegistrationPayload(req.body));

    let marketContext = null;
    let protectedIdentity = null;
    let addressDivisions = null;
    if (env.marketsIdentityGeographyEnabled) {
      if (!validatedData.marketCode || !validatedData.registrationSchemaVersion || !validatedData.identityDocument || !validatedData.normalizedAddress) {
        throw Object.assign(new Error('Current market registration data is required.'), { code: 'REGISTRATION_SCHEMA_REQUIRED', statusCode: 400 });
      }
      marketContext = await resolveMarketPolicy({ marketCode: validatedData.marketCode });
      assertCurrentSchema(marketContext.market, marketContext.policy, validatedData.registrationSchemaVersion);
      if (marketContext.market.country.isoAlpha2.trim() !== validatedData.countryCode) {
        throw Object.assign(new Error('Registration country does not match the market.'), { code: 'REGISTRATION_MARKET_COUNTRY_MISMATCH', statusCode: 400 });
      }
      const submittedType = validatedData.identityDocument.type;
      const typeKey = canonicalType(validatedData.countryCode, submittedType);
      const supported = marketContext.policy.identityPolicy.documentTypes.some((document) => document.type === typeKey || document.aliases?.includes(submittedType));
      if (!supported) throw Object.assign(new Error('Identity document type is unsupported.'), { code: 'IDENTITY_TYPE_UNSUPPORTED', statusCode: 400 });
      const identityValidation = validateIdentityDocument({ countryCode: validatedData.countryCode, type: submittedType, value: validatedData.identityDocument.value });
      if (!identityValidation.valid) throw Object.assign(new Error('Identity document format is invalid.'), { code: identityValidation.category === 'INVALID_CHECKSUM' ? 'IDENTITY_CHECKSUM_INVALID' : 'IDENTITY_FORMAT_INVALID', statusCode: 400 });
      protectedIdentity = { typeKey: identityValidation.type, ...protectIdentityValue({ normalized: identityValidation.normalized, countryCode: validatedData.countryCode, typeKey: identityValidation.type }) };
      assertAddressPolicyInput(validatedData.normalizedAddress, marketContext.policy);
      addressDivisions = await validateDivisionHierarchy({ divisionIds: validatedData.normalizedAddress.divisionIds, market: marketContext.market, policy: marketContext.policy });
    }

    // Verificar si el email o teléfono ya existen
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: validatedData.email },
          { phone: validatedData.phone },
        ],
      },
    });

    if (existingUser) return res.status(409).json({
      error: 'Registration data conflicts with an existing account.',
      code: 'REGISTRATION_CONFLICT',
      correlationId: req.context?.correlationId,
    });

    // Hashear contraseña
    const passwordHash = await hashPassword(validatedData.password);

    // User/profile and optional F7 decision are one transaction. Marketing denial
    // never blocks account creation when no policy was presented.
    const registration = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        email: validatedData.email,
        phone: validatedData.phone,
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: validatedData.role,
        countryCode: validatedData.countryCode,
        registrationLocale: validatedData.locale,
        marketId: marketContext?.market.id,
        termsAcceptedAt: new Date(),
        termsVersion: validatedData.termsVersion,
        privacyAcceptedAt: new Date(),
        privacyVersion: validatedData.privacyVersion,
        marketingConsentAt: validatedData.marketingConsent ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        countryCode: true,
        createdAt: true,
      } });

      if (marketContext && protectedIdentity && addressDivisions) {
        await tx.identityDocument.create({
          data: {
            userId: created.id, marketId: marketContext.market.id, countryId: marketContext.market.countryId,
            typeKey: protectedIdentity.typeKey, encryptedValue: protectedIdentity.encryptedValue,
            encryptionKeyVersion: protectedIdentity.encryptionKeyVersion, lookupDigest: protectedIdentity.lookupDigest,
            maskedValue: protectedIdentity.maskedValue, formatStatus: 'VALID',
          },
        });
        await tx.address.create({
          data: {
            userId: created.id, marketId: marketContext.market.id, countryId: marketContext.market.countryId,
            purpose: validatedData.role === 'PROFESSIONAL' ? 'PROFESSIONAL_DOMICILE' : 'CLIENT_CONTACT',
            line1: validatedData.normalizedAddress.line1, line2: validatedData.normalizedAddress.line2,
            locality: validatedData.normalizedAddress.locality, postalCode: validatedData.normalizedAddress.postalCode,
            validationStatus: 'FORMAT_VALID', isPrimary: true,
            divisions: { create: addressDivisions.map((division) => ({ divisionId: division.id, level: division.level })) },
          },
        });
      }

      let professionalId;
      if (validatedData.role === 'CLIENT') {
        await tx.clientProfile.create({
          data: { userId: created.id, country: validatedData.countryCode },
        });
      } else if (validatedData.role === 'PROFESSIONAL') {
        const profile = await tx.professionalProfile.create({
        data: { 
          userId: created.id,
          status: 'PENDING_REVIEW',
        },
        });
        professionalId = profile.id;
      }

      if (env.consentAttributionEnabled && validatedData.marketingPolicyId) {
        await recordDecision({
          input: {
            idempotencyKey: `registration:${created.id}:marketing:v${validatedData.marketingPolicyVersion}`,
            policyId: validatedData.marketingPolicyId,
            policyVersion: validatedData.marketingPolicyVersion,
            purpose: 'marketing_attribution',
            countryCode: validatedData.countryCode,
            locale: validatedData.locale,
            decision: validatedData.marketingConsent ? 'GRANTED' : 'DENIED',
            source: 'REGISTRATION',
            evidence: { interaction: 'separate_optional_control' },
          },
          identity: { userId: created.id, professionalId },
          context: req.context,
          database: tx,
        });
      }
      const sessionAuth = await createCustomerSessionInTransaction({
        userId: created.id,
        role: created.role,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      }, tx);
      return { user: created, sessionAuth };
    });

    const { user, sessionAuth } = registration;

    if (marketContext) await writeAuditLog({ req: { ...req, user }, action: 'MARKET_REGISTRATION_COMPLETED', resourceType: 'USER', resourceId: user.id, metadata: { marketCode: marketContext.market.code, schemaVersion: validatedData.registrationSchemaVersion, identityType: protectedIdentity.typeKey, divisionCount: addressDivisions.length } });

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token: sessionAuth.accessToken,
      accessToken: sessionAuth.accessToken,
      refreshToken: sessionAuth.refreshToken,
      session: sessionAuth.session,
    });
  } catch (error) {
    logError(req, error, 'Registration failed');
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.issues
      });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Registration data conflicts with an existing account.', code: 'REGISTRATION_CONFLICT', correlationId: req.context?.correlationId });
    }

    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Internal server error',
      code: error.statusCode ? error.code : undefined,
      correlationId: req.context?.correlationId,
    });
  }
};

// Login
exports.login = async (req, res, next) => {
  try {
    // Validar datos de entrada
    const validatedData = loginSchema.parse(req.body);

    // Buscar usuario por email
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
      include: {
        clientProfile: true,
        professionalProfile: true,
      },
    });

    const isValidPassword = await comparePassword(
      validatedData.password,
      user?.passwordHash || DUMMY_PASSWORD_HASH
    );

    if (!user || !user.isActive || !isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    const sessionAuth = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return createCustomerSessionInTransaction({
        userId: user.id,
        role: user.role,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      }, tx);
    });

    // Eliminar passwordHash de la respuesta
    const { passwordHash, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token: sessionAuth.accessToken,
      accessToken: sessionAuth.accessToken,
      refreshToken: sessionAuth.refreshToken,
      session: sessionAuth.session,
    });
  } catch (error) {
    logError(req, error, 'Login failed');
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.issues
      });
    }

    next(error);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = refreshSessionSchema.parse(req.body);
    const sessionAuth = await refreshCustomerSession({
      refreshToken,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
    res.json({
      token: sessionAuth.accessToken,
      accessToken: sessionAuth.accessToken,
      refreshToken: sessionAuth.refreshToken,
      session: sessionAuth.session,
    });
  } catch (error) {
    logError(req, error, 'Customer session refresh failed');
    next(error);
  }
};

exports.requestPasswordRecovery = async (req, res) => {
  const response = {
    message: 'If the account is eligible, password reset instructions will be sent.',
  };
  try {
    const input = passwordRecoveryRequestSchema.parse(req.body);
    try {
      await requestPasswordReset({
        ...input,
        correlationId: req.context?.correlationId,
        notificationService,
      });
    } catch (deliveryError) {
      logError(req, deliveryError, 'Password recovery delivery failed');
    }
    return res.status(202).json(response);
  } catch (error) {
    logError(req, error, 'Password recovery request validation failed');
    if (error.name === 'ZodError') return res.status(400).json({ error: 'Validation error', details: error.issues });
    return res.status(202).json(response);
  }
};

exports.confirmPasswordRecovery = async (req, res, next) => {
  try {
    const input = passwordResetSchema.parse(req.body);
    await resetPassword(input);
    res.json({ message: 'Password changed successfully. Sign in again on every device.' });
  } catch (error) {
    logError(req, error, 'Password recovery confirmation failed');
    next(error);
  }
};

exports.requestEmailVerification = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, emailVerifiedAt: true, registrationLocale: true },
    });
    const result = await requestEmailVerification({
      user,
      correlationId: req.context?.correlationId,
      notificationService,
    });
    res.status(202).json({ accepted: result.accepted, alreadyVerified: Boolean(result.alreadyVerified) });
  } catch (error) {
    logError(req, error, 'Email verification request failed');
    next(error);
  }
};

exports.confirmEmailVerification = async (req, res, next) => {
  try {
    const input = accountActionConfirmSchema.parse(req.body);
    await verifyEmail(input);
    res.json({ verified: true });
  } catch (error) {
    logError(req, error, 'Email verification confirmation failed');
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    if (!req.customerSession) {
      return res.status(409).json({
        error: 'Sign in again to obtain a revocable session.',
        code: 'CUSTOMER_SESSION_UPGRADE_REQUIRED',
      });
    }
    await revokeCustomerSession({
      sessionId: req.customerSession.id,
      userId: req.user.id,
      reason: 'USER_LOGOUT',
    });
    res.status(204).send();
  } catch (error) {
    logError(req, error, 'Customer logout failed');
    next(error);
  }
};

exports.listSessions = async (req, res, next) => {
  try {
    if (!req.customerSession) {
      return res.status(409).json({
        error: 'Sign in again to manage sessions.',
        code: 'CUSTOMER_SESSION_UPGRADE_REQUIRED',
      });
    }
    const sessions = await listCustomerSessions({
      userId: req.user.id,
      currentSessionId: req.customerSession.id,
    });
    res.json({ sessions });
  } catch (error) {
    logError(req, error, 'Customer session listing failed');
    next(error);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.sessionId).success) {
      return res.status(400).json({ error: 'Invalid session identifier.', code: 'VALIDATION_ERROR' });
    }
    const revoked = await revokeCustomerSession({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      reason: 'USER_REVOKED',
    });
    if (!revoked) return res.status(404).json({ error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
    res.status(204).send();
  } catch (error) {
    logError(req, error, 'Customer session revocation failed');
    next(error);
  }
};

// Obtener perfil del usuario autenticado
exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        clientProfile: {
          include: {
            favoriteProfessionals: {
              include: { professional: true },
            },
          },
        },
        professionalProfile: {
          include: {
            categories: { include: { category: true } },
            services: true,
            portfolio: true,
            certifications: true,
            availability: true,
          },
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, ...userWithoutPassword } = user;

    const profile = user.role === 'CLIENT' ? user.clientProfile : user.professionalProfile;
    res.json({ user: userWithoutPassword, profile });
  } catch (error) {
    logError(req, error, 'Profile lookup failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Actualizar perfil
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, avatarUrl, address, city, state, postalCode, country } = updateProfileSchema.parse(req.body);

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        updatedAt: true,
      },
    });

    if (req.user.role === 'CLIENT') {
      await prisma.clientProfile.update({
        where: { userId: req.user.id },
        data: {
          ...(address !== undefined && { address }),
          ...(city !== undefined && { city }),
          ...(state !== undefined && { state }),
          ...(postalCode !== undefined && { postalCode }),
          ...(country !== undefined && { country }),
        },
      });
    }

    const profile = req.user.role === 'CLIENT'
      ? await prisma.clientProfile.findUnique({ where: { userId: req.user.id } })
      : await prisma.professionalProfile.findUnique({ where: { userId: req.user.id } });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
      profile,
    });
  } catch (error) {
    logError(req, error, 'Profile update failed');
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Cambiar contraseña
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    // Obtener usuario con passwordHash
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    // Verificar contraseña actual
    const isValidPassword = await comparePassword(
      currentPassword, 
      user.passwordHash
    );

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Current password is incorrect' 
      });
    }

    // Hashear nueva contraseña
    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.user.id }, data: { passwordHash } });
      await revokeAllCustomerSessionsInTransaction({
        userId: req.user.id,
        reason: 'PASSWORD_CHANGED',
      }, tx);
    });

    res.json({ message: 'Password changed successfully. Sign in again on every device.' });
  } catch (error) {
    logError(req, error, 'Password change failed');
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};
