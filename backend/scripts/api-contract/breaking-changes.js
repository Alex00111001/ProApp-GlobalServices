// Directional compatibility: callers must retain accepted inputs and guaranteed outputs.
// Unhandled schema changes are review-required, never silently declared compatible.
const stable = (value) => JSON.stringify(value);
// Response serializers strengthen the output boundary and are compared through
// response schemas/statuses below. They are not request/auth middleware.
const requestMiddleware = (items = []) => items.filter((item) => !item.startsWith('responseContract('));
function schemaChanges(before, after, direction, location, changes) {
  if (stable(before) === stable(after)) return;
  if (!before || !after) { changes.push(`${location}: schema removed or added without compatibility proof`); return; }
  const requiredBefore = new Set(before.required || []);
  const requiredAfter = new Set(after.required || []);
  for (const key of direction === 'request' ? requiredAfter : requiredBefore) {
    if (!(direction === 'request' ? requiredBefore : requiredAfter).has(key)) changes.push(`${location}.${key}: requiredness changed incompatibly`);
  }
  const handled = new Set(['properties', 'required', 'description', 'title', 'examples', '$schema']);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (handled.has(key) || stable(before[key]) === stable(after[key])) continue;
    if (key === 'enum' && Array.isArray(before.enum) && Array.isArray(after.enum)) {
      const prior = direction === 'request' ? before.enum : after.enum;
      const next = direction === 'request' ? after.enum : before.enum;
      if (prior.every((entry) => next.some((item) => stable(item) === stable(entry)))) continue;
    }
    if (direction === 'request' && ['maximum', 'maxLength', 'maxItems', 'maxProperties'].includes(key)
      && (after[key] === undefined || after[key] >= before[key])) continue;
    if (direction === 'request' && ['minimum', 'minLength', 'minItems', 'minProperties'].includes(key)
      && (after[key] === undefined || after[key] <= before[key])) continue;
    changes.push(`${location}.${key}: incompatible or unproven schema change`);
  }
  for (const [key, schema] of Object.entries(before.properties || {})) {
    if (!after.properties?.[key]) changes.push(`${location}.${key}: supported field removed`);
    else schemaChanges(schema, after.properties[key], direction, `${location}.${key}`, changes);
  }
}

function breakingChanges(baseline, candidate) {
  const changes = [];
  const current = new Map(candidate.routes.map((route) => [`${route.method} ${route.path}`, route]));
  for (const before of baseline.routes) {
    const key = `${before.method} ${before.path}`;
    const after = current.get(key);
    if (!after) { changes.push(`${key}: supported operation removed`); continue; }
    for (const field of ['auth', 'middleware', 'classification']) {
      const beforeValue = field === 'middleware' ? requestMiddleware(before[field]) : before[field];
      const afterValue = field === 'middleware' ? requestMiddleware(after[field]) : after[field];
      if (stable(beforeValue) !== stable(afterValue)) changes.push(`${key}: ${field} contract changed`);
    }
    const beforeStatuses = new Set(before.response.flatMap((response) => response.statuses));
    const afterStatuses = new Set(after.response.flatMap((response) => response.statuses));
    for (const code of beforeStatuses) if (!afterStatuses.has(code)) changes.push(`${key}: contractual status ${code} removed`);
    for (const validation of before.validation) {
      const next = after.validation.find((item) => item.input === validation.input);
      if (!next) { changes.push(`${key}: runtime validation removed`); continue; }
      const previousSchema = baseline.schemas[`${before.handler.file}#${validation.schema}`];
      const nextSchema = candidate.schemas[`${after.handler.file}#${next.schema}`];
      schemaChanges(previousSchema?.jsonSchema, nextSchema?.jsonSchema, 'request', `${key}:${validation.input}`, changes);
    }
    for (const response of before.response) {
      for (const code of response.statuses) {
        const fields = new Set(after.response.filter((r) => r.statuses.includes(code)).flatMap((r) => r.fields));
        for (const field of response.fields) if (!fields.has(field)) changes.push(`${key}: ${code} output field ${field} removed`);
      }
    }
  }
  return [...new Set(changes)].sort();
}

module.exports = { breakingChanges, schemaChanges };
