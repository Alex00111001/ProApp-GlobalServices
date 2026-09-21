const path = require('node:path');
const { ROOT, readSource } = require('./source-inventory');
const { projectSchema } = require('./schema-catalog');

function responseCatalog(routes) {
  const contexts = new Map();
  for (const file of new Set(routes.map((route) => route.registration.file))) {
    if (file === 'backend/src/app.js') continue;
    contexts.set(file, readSource(path.join(ROOT, file)));
  }

  const entries = {};
  for (const route of routes) {
    const bindings = route.middleware.filter((item) => item.startsWith('responseContract('));
    if (bindings.length > 1) throw new Error(`Multiple response authorities for ${route.method} ${route.path}.`);
    if (!bindings.length) continue;
    const expression = bindings[0].match(/^responseContract\(([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\)$/);
    if (!expression) throw new Error(`Unsupported response authority binding for ${route.method} ${route.path}.`);
    const context = contexts.get(route.registration.file);
    const imported = context.imports.get(expression[1]);
    if (!imported?.target.startsWith('../contracts/')) throw new Error(`Response authority must come from a contract module for ${route.method} ${route.path}.`);
    const module = require(path.resolve(path.dirname(context.file), imported.target));
    const namespace = imported.exportName ? module[imported.exportName] : module;
    const contract = namespace?.[expression[2]];
    if (!contract) throw new Error(`Missing response authority for ${route.method} ${route.path}.`);
    if (contract.method !== route.method || contract.path !== route.path) {
      throw new Error(`Response authority is bound to the wrong route: ${route.method} ${route.path}.`);
    }
    const responses = {};
    let complete = true;
    for (const [status, definition] of Object.entries(contract.responses)) {
      if (definition === null) responses[status] = { empty: true, jsonSchema: null, wireParity: 'RUNTIME_AUTHORITATIVE', gaps: [] };
      else {
        const projection = projectSchema(definition.schema, 'output');
        complete &&= projection.jsonSchema !== null && projection.gaps.length === 0;
        responses[status] = { empty: false, ...projection,
          wireParity: projection.jsonSchema !== null && projection.gaps.length === 0 ? 'RUNTIME_AUTHORITATIVE' : 'UNPROVEN' };
      }
    }
    entries[`${route.method} ${route.path}`] = { operationId: contract.operationId, complete, responses };
  }
  return entries;
}

module.exports = { responseCatalog };
