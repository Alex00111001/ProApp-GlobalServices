const crypto = require('node:crypto');
const env = require('../../config/env');
const { maskIdentityDocument } = require('./identity-adapters');

const encryptionKey = () => {
  if (env.identityDocumentEncryptionKeyBase64) {
    const key = Buffer.from(env.identityDocumentEncryptionKeyBase64, 'base64');
    if (key.length !== 32) throw Object.assign(new Error('Identity protection is not configured.'), { code: 'IDENTITY_PROTECTION_UNAVAILABLE', statusCode: 503 });
    return key;
  }
  if (env.isProduction) throw Object.assign(new Error('Identity protection is not configured.'), { code: 'IDENTITY_PROTECTION_UNAVAILABLE', statusCode: 503 });
  return crypto.createHash('sha256').update('development-only-identity-encryption-key').digest();
};

const protectIdentityValue = ({ normalized, countryCode, typeKey }) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const aad = Buffer.from(`${countryCode}:${typeKey}:${env.identityDocumentEncryptionKeyVersion}`, 'utf8');
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Object.freeze({
    encryptedValue: Buffer.concat([iv, tag, encrypted]).toString('base64'),
    encryptionKeyVersion: env.identityDocumentEncryptionKeyVersion,
    lookupDigest: crypto.createHmac('sha256', env.identityDocumentLookupKey).update(`${countryCode}:${typeKey}:${normalized}`).digest('hex'),
    maskedValue: maskIdentityDocument(normalized),
  });
};

module.exports = { protectIdentityValue };
