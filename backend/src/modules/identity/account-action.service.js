const crypto = require('node:crypto');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { hashPassword } = require('../../utils/password');
const { revokeAllCustomerSessionsInTransaction } = require('./customer-session.service');

const actionError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const tokenDigest = (token) => crypto.createHmac('sha256', env.customerSessionPepper).update(token).digest('hex');
const newToken = () => crypto.randomBytes(48).toString('base64url');
const ttlFor = (type) => type === 'PASSWORD_RESET' ? env.passwordResetTokenMinutes : env.emailVerificationTokenHours * 60;

const issueAccountActionToken = async ({ userId, type }, client = prisma) => {
  const token = newToken();
  const expiresAt = new Date(Date.now() + ttlFor(type) * 60_000);
  const record = await client.$transaction(async (tx) => {
    await tx.accountActionToken.updateMany({
      where: { userId, type, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    return tx.accountActionToken.create({
      data: { userId, type, tokenHash: tokenDigest(token), expiresAt },
      select: { id: true, type: true, expiresAt: true },
    });
  });
  return { token, record };
};

const revokeIssuedToken = (id, client = prisma) => client.accountActionToken.updateMany({
  where: { id, status: 'ACTIVE' },
  data: { status: 'REVOKED', revokedAt: new Date() },
});

const requestPasswordReset = async ({ email, locale, correlationId, notificationService }, client = prisma) => {
  const user = await client.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true, registrationLocale: true },
  });
  if (!user?.isActive) return { accepted: true, delivered: false };
  const issued = await issueAccountActionToken({ userId: user.id, type: 'PASSWORD_RESET' }, client);
  try {
    await notificationService.sendEmail({
      recipient: user.email,
      templateKey: 'account.password_reset',
      locale: locale || user.registrationLocale || 'en',
      variables: {
        actionUrl: `${env.accountActionBaseUrl}/account/password-reset?token=${encodeURIComponent(issued.token)}`,
        expiresAt: issued.record.expiresAt.toISOString(),
      },
      correlationId,
      idempotencyKey: `password-reset:${issued.record.id}`,
    });
    return { accepted: true, delivered: true };
  } catch (error) {
    await revokeIssuedToken(issued.record.id, client);
    throw error;
  }
};

const requestEmailVerification = async ({ user, correlationId, notificationService }, client = prisma) => {
  if (user.emailVerifiedAt) return { accepted: true, delivered: false, alreadyVerified: true };
  const issued = await issueAccountActionToken({ userId: user.id, type: 'EMAIL_VERIFICATION' }, client);
  try {
    await notificationService.sendEmail({
      recipient: user.email,
      templateKey: 'account.email_verification',
      locale: user.registrationLocale || 'en',
      variables: {
        actionUrl: `${env.accountActionBaseUrl}/account/email-verification?token=${encodeURIComponent(issued.token)}`,
        expiresAt: issued.record.expiresAt.toISOString(),
      },
      correlationId,
      idempotencyKey: `email-verification:${issued.record.id}`,
    });
    return { accepted: true, delivered: true };
  } catch (error) {
    await revokeIssuedToken(issued.record.id, client);
    throw error;
  }
};

const claimActionToken = async ({ token, type }, work, client = prisma) => {
  const record = await client.accountActionToken.findUnique({
    where: { tokenHash: tokenDigest(token) },
    select: { id: true, userId: true, type: true, status: true, expiresAt: true },
  });
  if (!record || record.type !== type || record.status !== 'ACTIVE' || record.expiresAt <= new Date()) {
    throw actionError(400, 'ACCOUNT_ACTION_TOKEN_INVALID', 'The action token is invalid or expired.');
  }
  return client.$transaction(async (tx) => {
    const claimed = await tx.accountActionToken.updateMany({
      where: { id: record.id, type, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw actionError(409, 'ACCOUNT_ACTION_TOKEN_REPLAYED', 'The action token has already been used.');
    return work({ tx, record });
  });
};

const resetPassword = async ({ token, newPassword }, client = prisma) => {
  const passwordHash = await hashPassword(newPassword);
  return claimActionToken({ token, type: 'PASSWORD_RESET' }, async ({ tx, record }) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await revokeAllCustomerSessionsInTransaction({ userId: record.userId, reason: 'PASSWORD_RESET' }, tx);
    return { changed: true };
  }, client);
};

const verifyEmail = ({ token }, client = prisma) => claimActionToken(
  { token, type: 'EMAIL_VERIFICATION' },
  async ({ tx, record }) => {
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    return { verified: true };
  },
  client
);

module.exports = {
  claimActionToken,
  issueAccountActionToken,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  tokenDigest,
  verifyEmail,
};
