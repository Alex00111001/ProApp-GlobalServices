const { assertBalanced } = require('../ledger/ledger.service');

const allocateServiceRefund = ({ serviceRefundMinor, serviceAmountMinor, professionalCommissionMinor }) => {
  if (![serviceRefundMinor, serviceAmountMinor, professionalCommissionMinor].every(Number.isSafeInteger)) {
    throw new TypeError('Refund allocation requires integer minor units');
  }
  if (serviceRefundMinor < 0 || serviceRefundMinor > serviceAmountMinor || professionalCommissionMinor < 0 || professionalCommissionMinor > serviceAmountMinor) {
    throw new RangeError('Refund allocation exceeds captured service economics');
  }
  if (serviceAmountMinor === 0) return { commissionRefundMinor: 0, professionalPayableRefundMinor: 0 };

  const commissionRefundMinor = Number(
    (BigInt(serviceRefundMinor) * BigInt(professionalCommissionMinor) + (BigInt(serviceAmountMinor) / 2n)) /
    BigInt(serviceAmountMinor)
  );
  return {
    commissionRefundMinor,
    professionalPayableRefundMinor: serviceRefundMinor - commissionRefundMinor,
  };
};

const buildRefundEntries = ({ refund, capture, accountIds }) => {
  const totalRefundMinor = refund.serviceRefundMinor + refund.platformFeeRefundMinor;
  if (totalRefundMinor <= 0 || totalRefundMinor > capture.customerTotalMinor) {
    throw new RangeError('Refund total must be positive and cannot exceed the captured amount');
  }
  const allocation = allocateServiceRefund({
    serviceRefundMinor: refund.serviceRefundMinor,
    serviceAmountMinor: capture.serviceAmountMinor,
    professionalCommissionMinor: capture.professionalCommissionMinor,
  });
  const entryType = totalRefundMinor === capture.customerTotalMinor ? 'REFUND' : 'PARTIAL_REFUND';
  const entries = [
    ...(allocation.professionalPayableRefundMinor > 0 ? [{
      accountId: accountIds.professionalPayable,
      entryType,
      direction: 'DEBIT',
      amountMinor: allocation.professionalPayableRefundMinor,
      currency: capture.currency,
    }] : []),
    ...(allocation.commissionRefundMinor > 0 ? [{
      accountId: accountIds.commissionRevenue,
      entryType,
      direction: 'DEBIT',
      amountMinor: allocation.commissionRefundMinor,
      currency: capture.currency,
    }] : []),
    ...(refund.platformFeeRefundMinor > 0 ? [{
      accountId: accountIds.platformFeeRevenue,
      entryType,
      direction: 'DEBIT',
      amountMinor: refund.platformFeeRefundMinor,
      currency: capture.currency,
    }] : []),
    {
      accountId: accountIds.paymentClearing,
      entryType,
      direction: 'CREDIT',
      amountMinor: totalRefundMinor,
      currency: capture.currency,
    },
  ];
  assertBalanced(entries);
  return entries;
};

module.exports = { allocateServiceRefund, buildRefundEntries };
