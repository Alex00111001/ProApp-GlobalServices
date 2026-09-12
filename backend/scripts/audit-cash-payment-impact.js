require('dotenv').config();

const { Client } = require('pg');
const { verifySupabaseTarget } = require('./audit-supabase-default-deny');

const CASH_IMPACT_QUERY = `
  SELECT
    payment.status::text AS payment_status,
    booking.status::text AS booking_status,
    upper(payment.currency) AS currency,
    count(*)::integer AS record_count,
    count(*) FILTER (
      WHERE payment."transactionId" IS NOT NULL
         OR payment."providerChargeId" IS NOT NULL
         OR payment."processedAt" IS NOT NULL
    )::integer AS provider_evidence_count,
    count(*) FILTER (
      WHERE payment.amount <> booking."totalPrice"
         OR upper(payment.currency) <> upper(booking.currency)
    )::integer AS booking_value_mismatch_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM "LedgerTransaction" ledger
        WHERE ledger."paymentId" = payment.id
      )
    )::integer AS ledger_link_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM "Refund" refund
        WHERE refund."paymentId" = payment.id
      )
    )::integer AS refund_link_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM "Payout" payout
        WHERE payout."paymentId" = payment.id
      )
    )::integer AS payout_link_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM "Dispute" dispute
        WHERE dispute."paymentId" = payment.id
      )
    )::integer AS dispute_link_count
  FROM "Payment" payment
  JOIN "Booking" booking ON booking.id = payment."bookingId"
  WHERE payment.method = 'CASH'::"PaymentMethod"
  GROUP BY payment.status, booking.status, upper(payment.currency)
  ORDER BY payment.status, booking.status, upper(payment.currency)
`;

const assertImpactAuditOptIn = (value) => {
  if (value !== 'true') {
    throw new Error('Set ALLOW_CASH_IMPACT_AUDIT=true to authorize this aggregate-only read-only audit.');
  }
};

const number = (value) => Number(value || 0);

const summarize = (rows) => {
  const groups = rows.map((row) => ({
    paymentStatus: row.payment_status,
    bookingStatus: row.booking_status,
    currency: row.currency,
    records: number(row.record_count),
    providerEvidence: number(row.provider_evidence_count),
    bookingValueMismatch: number(row.booking_value_mismatch_count),
    ledgerLinked: number(row.ledger_link_count),
    refundLinked: number(row.refund_link_count),
    payoutLinked: number(row.payout_link_count),
    disputeLinked: number(row.dispute_link_count),
  }));
  const sum = (key) => groups.reduce((total, group) => total + group[key], 0);

  return {
    totalCashPayments: sum('records'),
    riskSignals: {
      providerEvidenceOnCash: sum('providerEvidence'),
      bookingValueMismatch: sum('bookingValueMismatch'),
      ledgerLinked: sum('ledgerLinked'),
      refundLinked: sum('refundLinked'),
      payoutLinked: sum('payoutLinked'),
      disputeLinked: sum('disputeLinked'),
      pendingCashOnConfirmedBooking: groups
        .filter((group) => group.paymentStatus === 'PENDING' && group.bookingStatus === 'CONFIRMED')
        .reduce((total, group) => total + group.records, 0),
      cashOnTerminalBooking: groups
        .filter((group) => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(group.bookingStatus))
        .reduce((total, group) => total + group.records, 0),
    },
    groups,
  };
};

const main = async () => {
  if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required and must not be committed.');
  assertImpactAuditOptIn(process.env.ALLOW_CASH_IMPACT_AUDIT);
  const target = verifySupabaseTarget(
    process.env.DIRECT_URL,
    process.env.EXPECTED_SUPABASE_PROJECT_REF
  );

  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL application_name = 'homeservices-cash-impact-audit'");
    const identity = (await client.query(`
      SELECT current_database() AS database_name,
             current_setting('transaction_read_only') AS transaction_read_only
    `)).rows[0];
    const rows = (await client.query(CASH_IMPACT_QUERY)).rows;

    console.log(JSON.stringify({
      status: 'READ_ONLY_INVENTORY_COMPLETE',
      target: {
        connectionKind: target.connectionKind,
        database: identity.database_name,
        readOnly: identity.transaction_read_only === 'on',
      },
      ...summarize(rows),
      limitations: [
        'Aggregate counts identify records requiring review; they do not prove causation.',
        'No row identifiers or personal data are emitted.',
        'No record is corrected, reinterpreted or mutated by this audit.',
      ],
    }, null, 2));
  } finally {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Connection cleanup still runs; the audit never commits database changes.
      }
    }
    await client.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      status: 'ERROR',
      code: error.code || 'CASH_IMPACT_AUDIT_FAILED',
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

module.exports = {
  CASH_IMPACT_QUERY,
  assertImpactAuditOptIn,
  summarize,
};
