const assertBalanced = (entries) => {
  const totals = new Map();
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) throw new TypeError('Ledger amounts must be positive minor units');
    const current = totals.get(entry.currency) || { debit: 0, credit: 0 };
    current[entry.direction.toLowerCase()] += entry.amountMinor;
    totals.set(entry.currency, current);
  }
  for (const [currency, total] of totals) {
    if (total.debit !== total.credit) throw new Error(`Unbalanced ledger transaction for ${currency}`);
  }
  return true;
};

const postTransaction = async ({ idempotencyKey, bookingId, paymentId, description, entries }, client) => {
  assertBalanced(entries);
  const database = client || require('../../../config/prisma');
  return database.$transaction(async (tx) => {
    const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey }, include: { entries: true } });
    if (existing) return existing;
    return tx.ledgerTransaction.create({
      data: {
        idempotencyKey, bookingId, paymentId, description, status: 'POSTED', postedAt: new Date(),
        entries: { create: entries.map((entry) => ({
          accountId: entry.accountId, entryType: entry.entryType, direction: entry.direction,
          amount: (entry.amountMinor / 100).toFixed(2), currency: entry.currency, metadata: entry.metadata,
        })) },
      },
      include: { entries: true },
    });
  });
};

module.exports = { assertBalanced, postTransaction };
