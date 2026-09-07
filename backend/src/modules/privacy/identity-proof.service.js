const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const env = require('../../config/env');
const prisma = require('../../config/prisma');
const { asynchronousEvidence, digest, operationalError, pseudonymize, requestEvidence } = require('./privacy-utils');
const { observePrivacyOperation } = require('../observability/metrics');

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload, secret = env.growthIdentityProofSecret) => createHmac('sha256', secret).update(payload).digest('base64url');

const authenticatedSubject = (identity = {}) => {
  if (identity.professionalId) return {
    subjectKey: pseudonymize('PROFESSIONAL', identity.professionalId),
    subjectType: 'PROFESSIONAL',
    userId: identity.userId,
  };
  if (identity.userId) return {
    subjectKey: pseudonymize('USER', identity.userId),
    subjectType: 'USER',
    userId: identity.userId,
  };
  return null;
};

const issueAnonymousProof = ({ anonymousId, now = new Date(), ttlHours = env.identityProofTtlHours } = {}) => {
  const raw = String(anonymousId || '');
  if (raw.length < 16 || raw.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(raw)) {
    throw operationalError('Anonymous identifier must be 16-128 safe characters.', 'INVALID_ANONYMOUS_IDENTIFIER', 400);
  }
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const claims = {
    v: 1,
    subjectKey: pseudonymize('ANONYMOUS', raw),
    subjectType: 'ANONYMOUS',
    nonce: randomBytes(16).toString('hex'),
    iat: issuedAt,
    exp: issuedAt + ttlHours * 3_600,
  };
  const payload = encode(claims);
  return { proof: `${payload}.${sign(payload)}`, expiresAt: new Date(claims.exp * 1_000), subjectType: claims.subjectType };
};

const verifyAnonymousProof = (proof, { now = new Date(), secret = env.growthIdentityProofSecret } = {}) => {
  const [payload, suppliedSignature, extra] = String(proof || '').split('.');
  if (!payload || !suppliedSignature || extra) throw operationalError('Anonymous subject proof is invalid.', 'INVALID_IDENTITY_PROOF', 401);
  const expected = Buffer.from(sign(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw operationalError('Anonymous subject proof is invalid.', 'INVALID_IDENTITY_PROOF', 401);
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw operationalError('Anonymous subject proof is invalid.', 'INVALID_IDENTITY_PROOF', 401);
  }
  if (claims.v !== 1 || claims.subjectType !== 'ANONYMOUS' || !/^[a-f0-9]{64}$/.test(claims.subjectKey || '') || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) {
    throw operationalError('Anonymous subject proof is invalid.', 'INVALID_IDENTITY_PROOF', 401);
  }
  const current = Math.floor(now.getTime() / 1_000);
  if (claims.iat > current + 300 || claims.exp <= current || claims.exp - claims.iat > 168 * 3_600) {
    throw operationalError('Anonymous subject proof is expired or outside its allowed lifetime.', 'EXPIRED_IDENTITY_PROOF', 401);
  }
  return { subjectKey: claims.subjectKey, subjectType: claims.subjectType, proofDigest: digest(proof) };
};

const resolveTrustedSubject = ({ identity = {}, proof, allowAnonymous = true } = {}) => {
  const authenticated = authenticatedSubject(identity);
  if (authenticated) return authenticated;
  if (!allowAnonymous) throw operationalError('Authentication is required.', 'AUTHENTICATION_REQUIRED', 401);
  return verifyAnonymousProof(proof);
};

const reconcileIdentity = async ({ identity, proof, context = {}, database = prisma }) => {
  const authenticated = authenticatedSubject(identity);
  if (!authenticated?.userId) throw operationalError('Authentication is required for identity reconciliation.', 'AUTHENTICATION_REQUIRED', 401);
  const anonymous = verifyAnonymousProof(proof);
  const existing = await database.subjectIdentityLink.findUnique({ where: { anonymousSubjectKey: anonymous.subjectKey } });
  if (existing) {
    if (existing.userId !== authenticated.userId || existing.authenticatedSubjectKey !== authenticated.subjectKey) {
      observePrivacyOperation({ operation: 'identity_reconciliation', outcome: 'rejected', reason: 'account_conflict' });
      throw operationalError('Anonymous subject is already linked to a different account.', 'IDENTITY_LINK_CONFLICT', 409);
    }
    observePrivacyOperation({ operation: 'identity_reconciliation', outcome: 'duplicate' });
    return { link: existing, duplicate: true };
  }
  try {
    const create = async (tx) => {
      const link = await tx.subjectIdentityLink.create({ data: {
        anonymousSubjectKey: anonymous.subjectKey,
        authenticatedSubjectKey: authenticated.subjectKey,
        userId: authenticated.userId,
        proofDigest: anonymous.proofDigest,
        ...requestEvidence(context),
      } });
      await tx.outboxEvent.create({ data: {
        aggregateType: 'SubjectIdentityLink',
        aggregateId: link.id,
        eventType: 'privacy.identity.reconciled',
        payload: { linkId: link.id, subjectType: authenticated.subjectType },
        metadata: asynchronousEvidence(context),
      } });
      return link;
    };
    const link = database.$transaction ? await database.$transaction(create) : await create(database);
    observePrivacyOperation({ operation: 'identity_reconciliation', outcome: 'accepted' });
    return { link, duplicate: false };
  } catch (error) {
    if (error?.code === 'P2002') {
      const replay = await database.subjectIdentityLink.findUnique({ where: { anonymousSubjectKey: anonymous.subjectKey } });
      if (replay?.userId === authenticated.userId && replay.authenticatedSubjectKey === authenticated.subjectKey) return { link: replay, duplicate: true };
      throw operationalError('Identity proof cannot be replayed for this account.', 'IDENTITY_LINK_CONFLICT', 409);
    }
    throw error;
  }
};

module.exports = {
  authenticatedSubject,
  issueAnonymousProof,
  reconcileIdentity,
  resolveTrustedSubject,
  verifyAnonymousProof,
};
