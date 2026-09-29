const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readSource, walk, member, relative } = require('./source-inventory');
const { INPUT_SEMANTIC_CLASSES } = require('../../src/shared/http/input-contract');
const { unresolvedInput } = require('./input-evidence');

const OUTPUT = path.join(ROOT, 'docs/api/input-inventory.v1.json');
const primary = (classes) => ['LEGACY_COMPATIBILITY', 'CROSS_FIELD_VALIDATION', 'REFINEMENT', 'TRANSFORM', 'NORMALIZATION', 'RUNTIME_DERIVED', 'STRUCTURAL_EQUIVALENT'].find((name) => classes.includes(name));
const surfaceOf = (input) => /req\.body/.test(input) ? 'BODY' : /req\.query/.test(input) ? 'QUERY' : /req\.params/.test(input) ? 'PARAMS' : 'HEADERS';
function buildInputInventory(document) {
  const contexts = new Map();
  const operations = document.routes.map((route) => {
    if (!contexts.has(route.handler.file)) contexts.set(route.handler.file, readSource(path.join(ROOT, route.handler.file)));
    const context = contexts.get(route.handler.file);
    let handler = context.exports.get(route.handler.name);
    if (!handler && route.handler.name === 'inline') walk(context.ast, (node) => {
      if (node.type === 'CallExpression' && node.loc.start.line === route.registration.line
        && member(node.callee).startsWith('router.')) handler = node.arguments.at(-1);
    });
    const reads = new Map();
    const record = (surface, expression, line) => reads.set(`${surface}:${expression}`, { surface, expression, source: { file: route.handler.file, line } });
    walk(handler, (node) => {
      const name = member(node);
      if (/^req\.(body|query|params|headers)(?:\.|$)/.test(name)) record(surfaceOf(name), name, node.loc.start.line);
      if (/^req\.(user|adminSession|context)(?:\.|$)/.test(name)) record('SERVER_CONTEXT', name, node.loc.start.line);
      if (node.type === 'CallExpression' && ['req.get', 'req.header'].includes(member(node.callee))) {
        record('HEADERS', typeof node.arguments[0]?.value === 'string' ? node.arguments[0].value.toLowerCase() : 'DYNAMIC_HEADER_REVIEW_REQUIRED', node.loc.start.line);
      }
    });
    const bindings = route.validation.map((validation) => {
      const key = `${route.handler.file}#${validation.schema}`;
      const projection = document.schemas[key];
      const root = validation.schema.match(/^[A-Za-z0-9_]+/)?.[0];
      const imported = context.imports.get(root);
      let validatorSource = { file: route.handler.file, line: validation.line, expression: validation.schema };
      if (imported?.target.startsWith('.')) {
        const importedFile = require.resolve(path.resolve(path.dirname(context.file), imported.target));
        const importedContext = readSource(importedFile);
        const name = imported.exportName || validation.schema.match(/^[^.]+\.([A-Za-z0-9_]+)/)?.[1];
        validatorSource = { file: relative(importedFile), name: name || 'EXPRESSION_REVIEW_REQUIRED',
          line: importedContext.definitions.get(name)?.loc.start.line || null };
      }
      const classes = [...(projection?.semanticClasses || ['REFINEMENT'])];
      if (/normalize(?:Booking|Registration)Payload/.test(validation.input)) classes.push('LEGACY_COMPATIBILITY');
      const semanticClasses = [...new Set(classes)].sort();
      return { surface: surfaceOf(validation.input), expression: validation.input, validator: validation.schema,
        source: { file: route.handler.file, line: validation.line }, validatorSource, key, semanticClasses, primaryClass: primary(semanticClasses),
        unresolvedHistoricalProjection: projection?.wireParity !== 'STRUCTURAL',
        unresolvedInputSemantics: unresolvedInput(projection),
        semanticReviewRequired: projection?.semanticReviewRequired ?? true,
        currentProjection: projection || { wireParity: 'UNPROVEN', gaps: ['SCHEMA_BINDING_REQUIRES_REVIEW'] },
        evidenceStatus: projection?.semanticEvidence?.status === 'PASS' ? 'EXECUTED_VALIDATOR_CASES_ONLY' : 'NOT_PROVEN_BY_SOURCE_INVENTORY',
      };
    });
    const observedReads = [...reads.values()].sort((a, b) => `${a.surface}:${a.expression}`.localeCompare(`${b.surface}:${b.expression}`, 'en'));
    return { method: route.method, path: route.path, router: route.registration, controller: route.handler,
      auth: route.auth, domain: path.basename(route.handler.file, '.js'),
      risk: /auth|payment|refund|billing|booking|privacy|earning|payout|identity/.test(`${route.handler.file} ${route.path}`) ? 'CRITICAL'
        : route.classification === 'ADMIN' || /professional|user|profile|market|consent/.test(route.path) ? 'HIGH' : 'MEDIUM',
      classification: route.classification, legacySupport: route.classification === 'LEGACY_SUPPORTED' ? 'SUPPORTED_LEGACY'
        : route.classification === 'DEPRECATED' ? 'DEPRECATED_BUT_SUPPORTED' : 'NOT_CLASSIFIED_AS_LEGACY',
      consumers: document.consumers.filter((call) => call.operation === `${route.method} ${route.path}`),
      declaredRuntimeContext: route.inputContext,
      bindings, observedReads,
      additionalSurfaceGaps: observedReads.filter((read) => read.surface === 'HEADERS' || read.surface === 'SERVER_CONTEXT'
        || !bindings.some((binding) => binding.surface === read.surface)).map((read) => ({ ...read,
        semanticClass: read.surface === 'SERVER_CONTEXT' ? 'RUNTIME_DERIVED' : 'REFINEMENT',
        status: 'RUNTIME_SOURCE_REVIEW_REQUIRED',
      })),
    };
  });
  const bindings = operations.filter((r) => !['INTERNAL', 'REMOVAL_CANDIDATE'].includes(r.classification)).flatMap((r) => r.bindings);
  const unresolved = bindings.filter((b) => b.unresolvedInputSemantics);
  return { formatVersion: 1, status: 'SOURCE_INVENTORY_NOT_SEMANTIC_PROOF', sourceFingerprint: document.sourceFingerprint,
    semanticClasses: INPUT_SEMANTIC_CLASSES,
    summary: { operations: operations.length, inputBindings: bindings.length,
      unresolvedInputSemantics: unresolved.length,
      unresolvedHistoricalProjections: bindings.filter((b) => b.unresolvedHistoricalProjection).length,
      acceptanceEquivalentBindings: bindings.filter((b) => b.currentProjection.semanticEvidence?.inputSurfaceResolved).length,
      runtimeRefinedDeclaredBindings: bindings.filter((b) => b.currentProjection.semanticEvidence?.parityMode === 'STRUCTURAL_WITH_RUNTIME_REFINEMENT').length,
      observedInputReads: operations.flatMap((r) => r.observedReads).length,
      additionalSurfaceGaps: operations.flatMap((r) => r.additionalSurfaceGaps).length,
      unresolvedByPrimaryClass: Object.fromEntries(INPUT_SEMANTIC_CLASSES.map((name) => [name, unresolved.filter((b) => b.primaryClass === name).length])),
      semanticReviewBindings: bindings.filter((b) => b.semanticReviewRequired).length }, operations };
}

function checkInputInventory(document) {
  const expected = `${JSON.stringify(buildInputInventory(document), null, 2)}\n`;
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') !== expected) throw new Error('Input surface inventory is stale. Regenerate and review.');
}
module.exports = { OUTPUT, buildInputInventory, checkInputInventory };
if (require.main === module) {
  const document = require('./inventory-command').buildInventory();
  const inventory = buildInputInventory(document);
  const arg = process.argv[2];
  if (arg === '--write') fs.writeFileSync(OUTPUT, `${JSON.stringify(inventory, null, 2)}\n`);
  else if (arg === '--check') checkInputInventory(document);
  else if (arg !== '--summary') throw new Error('Use --write, --check or --summary.');
  console.log(JSON.stringify(inventory.summary));
}
