const { decimalToMinor } = require('../pricing/pricing.service');

const currencyCode = (value) => {
  const currency = String(value || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Payment currency must be a three-letter ISO code');
  return currency;
};

const normalizeCaptureAmounts = ({ booking, payment }) => {
  const currency = currencyCode(payment.currency || booking.currency);
  const customerTotalMinor = decimalToMinor(payment.amount);
  const usesSeparatedPricing = Boolean(booking.pricingSnapshot);
  const serviceAmountMinor = usesSeparatedPricing
    ? decimalToMinor(booking.serviceAmount)
    : customerTotalMinor;
  const platformFeeMinor = usesSeparatedPricing ? decimalToMinor(booking.platformFee) : 0;
  const professionalCommissionMinor = decimalToMinor(
    usesSeparatedPricing ? booking.professionalCommission : (booking.platformFee || 0)
  );
  const fallbackPayout = ((serviceAmountMinor - professionalCommissionMinor) / 100).toFixed(2);
  const professionalPayoutMinor = decimalToMinor(booking.professionalEarnings || fallbackPayout);

  if (customerTotalMinor !== serviceAmountMinor + platformFeeMinor) {
    throw new Error('Payment total does not match the booking service amount and customer platform fee');
  }
  if (serviceAmountMinor !== professionalCommissionMinor + professionalPayoutMinor) {
    throw new Error('Service amount does not match professional commission and payout');
  }

  return {
    currency,
    customerTotalMinor,
    serviceAmountMinor,
    platformFeeMinor,
    professionalCommissionMinor,
    professionalPayoutMinor,
    pricingMode: usesSeparatedPricing ? 'SEPARATED' : 'LEGACY_COMPATIBILITY',
  };
};

const buildCaptureEntries = (amounts, accountIds) => [
  {
    accountId: accountIds.paymentClearing,
    entryType: 'SERVICE_CHARGE',
    direction: 'DEBIT',
    amountMinor: amounts.customerTotalMinor,
    currency: amounts.currency,
  },
  ...(amounts.professionalPayoutMinor > 0 ? [{
    accountId: accountIds.professionalPayable,
    entryType: 'PROFESSIONAL_PAYOUT',
    direction: 'CREDIT',
    amountMinor: amounts.professionalPayoutMinor,
    currency: amounts.currency,
  }] : []),
  ...(amounts.platformFeeMinor > 0 ? [{
    accountId: accountIds.platformFeeRevenue,
    entryType: 'PLATFORM_FEE',
    direction: 'CREDIT',
    amountMinor: amounts.platformFeeMinor,
    currency: amounts.currency,
  }] : []),
  ...(amounts.professionalCommissionMinor > 0 ? [{
    accountId: accountIds.commissionRevenue,
    entryType: 'PROFESSIONAL_COMMISSION',
    direction: 'CREDIT',
    amountMinor: amounts.professionalCommissionMinor,
    currency: amounts.currency,
  }] : []),
];

module.exports = { normalizeCaptureAmounts, buildCaptureEntries };
