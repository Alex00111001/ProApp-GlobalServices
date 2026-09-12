const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  CASH_IMPACT_QUERY,
  assertImpactAuditOptIn,
  summarize,
} = require('../scripts/audit-cash-payment-impact');

test('cash impact audit requires an explicit opt-in', () => {
  assert.throws(() => assertImpactAuditOptIn(undefined), /ALLOW_CASH_IMPACT_AUDIT=true/);
  assert.throws(() => assertImpactAuditOptIn('false'), /ALLOW_CASH_IMPACT_AUDIT=true/);
  assert.doesNotThrow(() => assertImpactAuditOptIn('true'));
});

test('cash impact inventory query is aggregate-only and contains no mutation statement', () => {
  assert.match(CASH_IMPACT_QUERY, /count\(\*\)/i);
  assert.match(CASH_IMPACT_QUERY, /GROUP BY/i);
  assert.doesNotMatch(CASH_IMPACT_QUERY, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|MERGE|CALL)\b/i);
  assert.doesNotMatch(CASH_IMPACT_QUERY, /payment\.id\s+AS|booking\.id\s+AS/i);
});

test('cash impact runner enforces a repeatable-read read-only transaction and rollback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'audit-cash-payment-impact.js'), 'utf8');
  assert.match(source, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source, /SET LOCAL statement_timeout/);
  assert.match(source, /ROLLBACK/);
  assert.doesNotMatch(source, /\bCOMMIT\b/);
});

test('cash impact summary exposes counts without row or person identifiers', () => {
  const result = summarize([{
    payment_status: 'PENDING',
    booking_status: 'CONFIRMED',
    currency: 'EUR',
    record_count: 2,
    provider_evidence_count: 1,
    booking_value_mismatch_count: 1,
    ledger_link_count: 0,
    refund_link_count: 0,
    payout_link_count: 0,
    dispute_link_count: 0,
  }]);

  assert.equal(result.totalCashPayments, 2);
  assert.equal(result.riskSignals.pendingCashOnConfirmedBooking, 2);
  assert.equal(result.riskSignals.providerEvidenceOnCash, 1);
  assert.equal(result.riskSignals.bookingValueMismatch, 1);
  assert.doesNotMatch(JSON.stringify(result), /bookingId|paymentId|userId|email/i);
});
