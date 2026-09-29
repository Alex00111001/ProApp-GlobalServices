// Closed presence rules shared by the runtime predicate and JSON Schema projection.
// Callers must use non-empty/non-null field validators: presence then equals truthiness.
function enforceFieldRules(value, context, rules) {
  for (const rule of rules) {
    if (!['REQUIRED_WHEN_TRUE', 'TOGETHER'].includes(rule.kind)
      || (rule.kind === 'TOGETHER' && rule.fields.length !== 2)) throw new Error('Unsupported field rule requires runtime review.');
    const violated = rule.kind === 'REQUIRED_WHEN_TRUE'
      ? value[rule.flag] && rule.fields.some((field) => !value[field])
      : Boolean(value[rule.fields[0]]) !== Boolean(value[rule.fields[1]]);
    if (violated) context.addIssue({ code: 'custom', path: [rule.issuePath], message: rule.message });
  }
}
function projectFieldRules(rules) {
  return rules.map((rule) => {
    if (rule.kind === 'REQUIRED_WHEN_TRUE') return {
      if: { properties: { [rule.flag]: { const: true } }, required: [rule.flag] },
      then: { required: [...rule.fields] },
    };
    if (rule.kind === 'TOGETHER' && rule.fields.length === 2) return {
      dependentRequired: Object.fromEntries(rule.fields.map((field, index) => [field, [rule.fields[1 - index]]])),
    };
    throw new Error('Unsupported field rule requires explicit projection review.');
  });
}
module.exports = { enforceFieldRules, projectFieldRules };
