const { assertBalanced } = require('../ledger/ledger.service');

const buildPayoutEntries = ({ amountMinor, currency, accountIds }) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new TypeError('Payout amount must be positive minor units');
  }
  const entries = [
    {
      accountId: accountIds.professionalPayable,
      entryType: 'PROFESSIONAL_PAYOUT',
      direction: 'DEBIT',
      amountMinor,
      currency,
    },
    {
      accountId: accountIds.paymentClearing,
      entryType: 'PROFESSIONAL_PAYOUT',
      direction: 'CREDIT',
      amountMinor,
      currency,
    },
  ];
  assertBalanced(entries);
  return entries;
};

module.exports = { buildPayoutEntries };
