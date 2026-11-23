// Fixed command fixtures, independent from the wire grammar. No live identities or credentials.
const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reason = 'Reviewed operational decision';
const FIXTURES = Object.freeze({
  'admin.validators': {
    userStatusSchema: { isActive: false, reason }, professionalStatusSchema: { status: 'SUSPENDED', reason },
    revokeSessionSchema: { reason }, roleDecisionSchema: { reason },
  },
  'admin-operations.validators': {
    errorStatusSchema: { status: 'RESOLVED', reason }, incidentStatusSchema: { status: 'MONITORING', reason },
    incidentCommentSchema: { body: 'Reviewed incident comment' }, supportCaseStatusSchema: { status: 'TRIAGED', reason },
    supportCaseAssignmentSchema: { assignedToId: null, reason }, supportCaseCommentSchema: { body: 'Reviewed support comment' },
  },
  'privacy.validators': {
    reconciliationSchema: { proof: 'synthetic-proof-for-acceptance-tests-only-0123456789' },
    policyReviewSchema: { reviewStatus: 'APPROVED', reviewReference: 'Reviewed policy reference', reason },
    policyStatusSchema: { status: 'RETIRED', reason }, modelStatusSchema: { status: 'RETIRED', reason },
  },
  'referrals-automation.validators': {
    programStatusSchema: { status: 'PAUSED', expectedRowVersion: 1, reason },
    automationStatusSchema: { status: 'PAUSED', expectedRowVersion: 1, reason }, revokeCodeSchema: { reason },
  },
  'markets.validators': {
    marketStatusBody: { status: 'SUSPENDED', reason }, identityPolicyStatusBody: { status: 'RETIRED', reason },
    identityPolicyReviewBody: { decision: 'REJECTED', reviewReference: 'Reviewed policy reference', reason },
  },
  'supply-demand-ai.validators': {
    reviewBody: { decision: 'REJECTED', reason }, activateBody: { reason },
    approvalBody: { decision: 'REJECTED', artifactDigest: 'a'.repeat(64), reason },
    expansionReviewBody: { decision: 'REJECTED', reason }, providerStatusBody: { status: 'SUSPENDED', reason },
    expansionBody: { type: 'COVERAGE_REDUCTION', marketId: uuid, hypothesis: 'Reviewed capacity hypothesis' },
  },
  'experiments-content-seo.validators': {
    reviewBody: { decision: 'REJECTED', reason }, retireBody: { reason }, experimentStatusBody: { status: 'PAUSED', reason },
  },
});
const whitespace = [' ', '\t', '\r\n', '\u00a0', '\u1680', '\u2000', '\u2007', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'];
function normalizationCases(schema, evidenceId) {
  const match = /^trim\.(.+\.validators)\.([A-Za-z]+)$/.exec(evidenceId);
  const base = match && FIXTURES[match[1]]?.[match[2]];
  if (!base) throw new Error(`Missing fixed normalization fixture: ${evidenceId}`);
  const cases = [{ name: 'canonical command', value: base, accepted: true, expected: base }];
  for (const f of schema.homeservicesNormalizationFields) {
    for (const n of [...new Set([0, f.minimum - 1, f.minimum, f.minimum + 1, f.maximum, f.maximum + 1])]) {
      for (const atom of ['x', '\u{1f642}']) {
        const normalized = atom.repeat(n); const accepted = n >= f.minimum && n <= f.maximum;
        cases.push({ name: `${f.field} boundary ${n} ${atom}`, value: { ...base, [f.field]: `  ${normalized}  ` }, accepted,
          ...(accepted ? { expected: { ...base, [f.field]: normalized } } : {}) });
      }
    }
    for (const pad of whitespace) cases.push({ name: `${f.field} whitespace ${pad.codePointAt(0)}`, value: { ...base, [f.field]: pad + base[f.field] + pad }, accepted: true, expected: base });
    for (const value of [undefined, null, true, false, 0, 1, [], {}, ['text'], '']) cases.push({ name: `${f.field} invalid type/empty ${JSON.stringify(value)}`, value: { ...base, [f.field]: value }, accepted: false });
    // Trim does not lowercase, remove interior whitespace, normalize Unicode or truncate.
    for (const value of ['AbCdEFgHiJ', 'a\u0000b\tc\ndEFGh', 'e\u0301'.repeat(8), '\u200b'.repeat(16), '\u0085'.repeat(16)]) {
      const count = [...value.trim()].length; const accepted = count >= f.minimum && count <= f.maximum;
      cases.push({ name: `${f.field} preserved content ${JSON.stringify(value)}`, value: { ...base, [f.field]: value }, accepted,
        ...(accepted ? { expected: { ...base, [f.field]: value } } : {}) });
    }
  }
  const strict = schema._zod.def.catchall?._zod.def.type === 'never';
  for (const key of ['userId', 'actorId', 'role', 'permissions', 'marketCode', 'currency', 'X-Admin-Role', 'Authorization', '__proto__', 'constructor']) {
    const value = JSON.parse(JSON.stringify({ ...base, [key]: 'spoofed' }));
    cases.push({ name: `unknown/privileged field ${key}`, value, accepted: !strict, ...(!strict ? { expected: base } : {}) });
  }
  for (const value of [undefined, null, [], true, 1, 'text']) cases.push({ name: `invalid body ${JSON.stringify(value)}`, value, accepted: false });
  for (const [field, value] of Object.entries(base)) {
    if (!schema.homeservicesNormalizationFields.some((f) => f.field === field)) {
      cases.push({ name: `missing command field ${field}`, value: Object.fromEntries(Object.entries(base).filter(([key]) => key !== field)), accepted: false });
      cases.push({ name: `wrong command type ${field}`, value: { ...base, [field]: typeof value === 'boolean' ? 'false' : typeof value === 'number' ? '1' : 123 }, accepted: false });
    }
  }
  return cases;
}
module.exports = { FIXTURES, normalizationCases, whitespace };
