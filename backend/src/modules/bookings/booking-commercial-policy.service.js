const env = require('../../config/env');
const {
  CLIENT_PLATFORM_FEE_PERCENTAGE,
  PROFESSIONAL_COMMISSION_PERCENTAGE,
  PAYMENT_CURRENCY,
} = require('../../config/business');
const { canonicalDigest } = require('../privacy/privacy-utils');
const { resolveMarketPolicy } = require('../markets/market.service');

const fail = (message, code, statusCode = 503) => {
  throw Object.assign(new Error(message), { code, statusCode });
};

const basisPoints = (value, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    fail(`${field} must be an integer between 0 and 10000.`, 'PRICING_POLICY_INVALID');
  }
  return value;
};

const currencyCode = (value, field) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) fail(`${field} must be an ISO 4217 currency code.`, 'PRICING_POLICY_INVALID');
  return normalized;
};

const legacyCommercialPolicy = () => ({
  pricingPolicyId: null,
  currency: currencyCode(PAYMENT_CURRENCY, 'STRIPE_CURRENCY'),
  platformFeeBasisPoints: Math.round(CLIENT_PLATFORM_FEE_PERCENTAGE * 10_000),
  commissionBasisPoints: Math.round(PROFESSIONAL_COMMISSION_PERCENTAGE * 10_000),
  snapshot: {
    version: 2,
    source: 'LEGACY_SERVER_CONFIGURATION',
  },
});

const resolveBookingCommercialPolicy = async ({
  client,
  marketId,
  now = new Date(),
  marketsEnabled = env.marketsIdentityGeographyEnabled,
  resolvePolicy = resolveMarketPolicy,
}) => {
  if (!marketsEnabled) return legacyCommercialPolicy();
  if (!marketId) fail('An active market is required to price a booking.', 'BOOKING_MARKET_REQUIRED', 400);

  const marketReference = await client.market.findUnique({
    where: { id: marketId },
    select: { code: true },
  });
  if (!marketReference) fail('The booking market is unavailable.', 'MARKET_UNAVAILABLE', 404);

  const { market, policy: marketPolicy } = await resolvePolicy({
    marketCode: marketReference.code,
    client,
    requireActive: true,
    now,
  });
  const marketCurrency = currencyCode(market.currencyCode, 'Market.currencyCode');
  const policyCurrency = currencyCode(marketPolicy?.currencyPolicy?.currency, 'MarketPolicyVersion.currencyPolicy.currency');
  if (marketCurrency !== policyCurrency) {
    fail('Market and market-policy currencies do not match.', 'MARKET_CURRENCY_MISMATCH');
  }

  const pricingPolicy = await client.pricingPolicy.findFirst({
    where: {
      marketId: market.id,
      status: 'ACTIVE',
      effectiveAt: { lte: now },
      OR: [{ retiredAt: null }, { retiredAt: { gt: now } }],
    },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });
  if (!pricingPolicy) fail('No active pricing policy is available for this market.', 'PRICING_POLICY_UNAVAILABLE');

  const pricingCurrency = currencyCode(pricingPolicy.currency, 'PricingPolicy.currency');
  if (pricingCurrency !== marketCurrency) {
    fail('Pricing-policy and market currencies do not match.', 'PRICING_POLICY_CURRENCY_MISMATCH');
  }
  const rules = pricingPolicy.rules || {};
  const platformFeeBasisPoints = basisPoints(rules.clientPlatformFeeBasisPoints, 'clientPlatformFeeBasisPoints');
  const commissionBasisPoints = basisPoints(rules.professionalCommissionBasisPoints, 'professionalCommissionBasisPoints');

  return {
    pricingPolicyId: pricingPolicy.id,
    currency: marketCurrency,
    platformFeeBasisPoints,
    commissionBasisPoints,
    snapshot: {
      version: 2,
      source: 'MARKET_PRICING_POLICY',
      market: {
        id: market.id,
        code: market.code,
        policyVersion: marketPolicy.version,
        policySchemaDigest: marketPolicy.schemaDigest,
      },
      pricingPolicy: {
        id: pricingPolicy.id,
        key: pricingPolicy.key,
        version: pricingPolicy.version,
        rulesDigest: canonicalDigest(pricingPolicy.rules),
      },
      rules: { clientPlatformFeeBasisPoints: platformFeeBasisPoints, professionalCommissionBasisPoints: commissionBasisPoints },
    },
  };
};

module.exports = { legacyCommercialPolicy, resolveBookingCommercialPolicy };
