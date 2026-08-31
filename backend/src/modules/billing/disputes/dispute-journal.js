const { assertBalanced } = require('../ledger/ledger.service');

const buildTransferReversalEntries = ({ amountMinor, currency, accountIds }) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new TypeError('Transfer reversal amount must be positive minor units');
  }
  const entries = [
    {
      accountId: accountIds.paymentClearing,
      entryType: 'TRANSFER_REVERSAL',
      direction: 'DEBIT',
      amountMinor,
      currency,
    },
    {
      accountId: accountIds.professionalPayable,
      entryType: 'TRANSFER_REVERSAL',
      direction: 'CREDIT',
      amountMinor,
      currency,
    },
  ];
  assertBalanced(entries);
  return entries;
};

module.exports = { buildTransferReversalEntries };
