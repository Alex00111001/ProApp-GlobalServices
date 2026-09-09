const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../middleware/auth');
const { registerSchema, loginSchema, updateProfileSchema, changePasswordSchema } = require('../validators/auth.validators');
const { normalizeRegistrationPayload } = require('../shared/http/compatibility');
const env = require('../config/env');
const { recordDecision } = require('../modules/privacy/consent.service');
const { assertAddressPolicyInput, assertCurrentSchema, resolveMarketPolicy, validateDivisionHierarchy } = require('../modules/markets/market.service');
const { canonicalType, validateIdentityDocument } = require('../modules/markets/identity-adapters');
const { protectIdentityValue } = require('../modules/markets/identity-protection');
const { writeAuditLog } = require('../modules/audit/audit.service');

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

    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email or phone already registered' 
      });
    }

    // Hashear contraseña
    const passwordHash = await hashPassword(validatedData.password);

    // User/profile and optional F7 decision are one transaction. Marketing denial
    // never blocks account creation when no policy was presented.
    const user = await prisma.$transaction(async (tx) => {
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
      return created;
    });

    if (marketContext) await writeAuditLog({ req: { ...req, user }, action: 'MARKET_REGISTRATION_COMPLETED', resourceType: 'USER', resourceId: user.id, metadata: { marketCode: marketContext.market.code, schemaVersion: validatedData.registrationSchemaVersion, identityType: protectedIdentity.typeKey, divisionCount: addressDivisions.length } });

    // Generar token JWT
    const token = generateToken({ userId: user.id, role: user.role });

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token,
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
exports.login = async (req, res) => {
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

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Verificar si el usuario está activo
    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Account is deactivated' 
      });
    }

    // Verificar contraseña
    const isValidPassword = await comparePassword(
      validatedData.password, 
      user.passwordHash
    );

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Actualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generar token JWT
    const token = generateToken({ userId: user.id, role: user.role });

    // Eliminar passwordHash de la respuesta
    const { passwordHash, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    logError(req, error, 'Login failed');
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.issues
      });
    }

    res.status(500).json({ 
      error: 'Internal server error' 
    });
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

    // Actualizar contraseña
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logError(req, error, 'Password change failed');
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};
