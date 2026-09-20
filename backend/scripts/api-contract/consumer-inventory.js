const path = require('node:path');
const { ROOT, METHODS, files, member, property, readSource, relative, walk } = require('./source-inventory');

const SURFACES = [
  { name: 'Customer mobile', root: 'mobile-client/src', prefix: '/api' },
  { name: 'Professional mobile', root: 'mobile-professional/src', prefix: '/api' },
  { name: 'Admin Web', root: 'admin-web/src', prefix: '/api' },
  { name: 'Public Web', root: 'public-web', prefix: '/api' },
];
const shape = (value) => value.split('?')[0].replace(/\{[^}]+\}/g, '{}').replace(/\/$/, '');

function consumerInventory(routes) {
  const calls = [];
  for (const surface of SURFACES) for (const file of files(path.join(ROOT, surface.root))) {
    if (/\.test\.[jt]sx?$/.test(file)) continue;
    const context = readSource(file);
    const pathOf = (node, seen = new Set()) => {
      if (node?.type === 'StringLiteral') return node.value;
      if (node?.type === 'TemplateLiteral') {
        return node.quasis.map((part, i) => `${part.value.cooked}${i < node.expressions.length ?
          ['API', 'API_URL'].includes(member(node.expressions[i])) ? '' : '{parameter}' : ''}`).join('');
      }
      if (node?.type === 'Identifier' && !seen.has(node.name)) {
        seen.add(node.name); return pathOf(context.definitions.get(node.name), seen);
      }
      return null;
    };
    walk(context.ast, (node) => {
      if (node.type !== 'CallExpression') return;
      const fn = member(node.callee);
      const method = property(node.callee);
      const axios = METHODS.has(method) && /(?:^client|^this\.client|apiClient\.getClient\(\))/.test(member(node.callee.object));
      const admin = surface.name === 'Admin Web' && fn === 'api';
      const adminAuth = surface.name === 'Admin Web' && fn === 'authRequest';
      const fetchCall = fn === 'fetch';
      if (!axios && !admin && !adminAuth && !fetchCall) return;
      // The central transports receive arbitrary paths from their callers; inspect callers, not the transport twice.
      if (['admin-web/src/lib/api.ts'].includes(relative(file))) return;
      if (relative(file) === 'admin-web/src/state/session.ts' && fetchCall && node.loc.start.line === 39) return;
      const options = node.arguments[1];
      const methodOption = options?.type === 'ObjectExpression'
        ? options.properties.find((p) => (p.key?.name || p.key?.value) === 'method')?.value : null;
      const httpMethod = axios ? method.toUpperCase() : methodOption?.value || (methodOption ? 'UNRESOLVED' : 'GET');
      const requestedPath = pathOf(node.arguments[0]);
      const fullPath = requestedPath?.startsWith('/') ? `${surface.prefix}${requestedPath}` : null;
      const matches = fullPath ? routes.filter((route) => shape(route.path) === shape(fullPath) && route.method === httpMethod) : [];
      calls.push({ consumer: surface.name, file: relative(file), line: node.loc.start.line,
        method: httpMethod, path: fullPath, operation: matches.length === 1 ? `${matches[0].method} ${matches[0].path}` : null,
        status: !fullPath || httpMethod === 'UNRESOLVED' ? 'DYNAMIC_REVIEW_REQUIRED'
          : matches.length === 1 ? 'PATH_METHOD_MATCH' : 'NO_UNIQUE_OPERATION',
        requestResponseCompatibility: 'NOT_PROVEN_BY_PATH_MATCH',
      });
    });
  }
  return calls.sort((a, b) => a.file.localeCompare(b.file, 'en') || a.line - b.line);
}

module.exports = { SURFACES, consumerInventory, shape };
