const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '../../..');
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments', 'errors'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
};
const property = (node) => node?.computed ? node.property?.value : node?.property?.name;
const member = (node) => node?.type === 'ThisExpression' ? 'this' : node?.type === 'Identifier' ? node.name
  : ['MemberExpression', 'OptionalMemberExpression'].includes(node?.type) ? `${member(node.object)}.${property(node)}` : '';
const literals = (node) => node?.type === 'ArrayExpression' ? node.elements.flatMap(literals)
  : node?.type === 'StringLiteral' ? [node.value] : [];
const files = (folder, extensions = /\.[jt]sx?$/) => fs.readdirSync(folder, { withFileTypes: true })
  .filter((entry) => !['node_modules', '.next', 'dist'].includes(entry.name))
  .flatMap((entry) => entry.isDirectory() ? files(path.join(folder, entry.name), extensions)
    : extensions.test(entry.name) ? [path.join(folder, entry.name)] : []).sort();

function readSource(file) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  const imports = new Map();
  const definitions = new Map();
  const exports = new Map();
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.init) {
      if (node.id.type === 'Identifier') definitions.set(node.id.name, node.init);
      if (member(node.init.callee) === 'require' && literals(node.init.arguments[0]).length) {
        const target = node.init.arguments[0].value;
        if (node.id.type === 'Identifier') imports.set(node.id.name, { target });
        if (node.id.type === 'ObjectPattern') for (const prop of node.id.properties) {
          imports.set(prop.value.name, { target, exportName: prop.key.name });
        }
      }
    }
    if (node.type === 'AssignmentExpression' && member(node.left).startsWith('exports.')) {
      exports.set(property(node.left), node.right);
    }
  });
  return { file, source, ast, imports, definitions, exports, text: (node) => source.slice(node.start, node.end) };
}

function endpointEvidence(context, handler) {
  const validation = [];
  const response = [];
  const ownership = new Set();
  const ordering = [];
  walk(handler, (node) => {
    const chain = member(node);
    if (chain.startsWith('req.user.') || chain.startsWith('req.adminSession.')) ownership.add(chain);
    if (node.type === 'ObjectProperty' && (node.key.name || node.key.value) === 'orderBy') ordering.push(context.text(node.value));
    if (node.type !== 'CallExpression') return;
    if (['parse', 'safeParse'].includes(property(node.callee)) && node.arguments[0]) {
      const input = context.text(node.arguments[0]);
      if (/\breq\.(body|query|params)/.test(input)) validation.push({
        input, schema: context.text(node.callee.object), line: node.loc.start.line,
      });
    }
    if (['json', 'end', 'send'].includes(property(node.callee))) {
      const expression = context.text(node.callee.object);
      if (!/^res(?:\.|$)/.test(expression)) return;
      const statusNode = node.callee.object?.type === 'CallExpression'
        && property(node.callee.object.callee) === 'status' ? node.callee.object.arguments[0] : null;
      const statuses = [];
      if (statusNode) walk(statusNode, (part) => { if (part.type === 'NumericLiteral' && part.value >= 100 && part.value <= 599) statuses.push(part.value); });
      const payload = node.arguments[0];
      response.push({ statuses: statuses.length ? [...new Set(statuses)] : [200],
        fields: payload?.type === 'ObjectExpression' ? payload.properties.filter((p) => p.type !== 'SpreadElement').map((p) => p.key.name || p.key.value).sort() : [],
        completeSchema: false, line: node.loc.start.line });
    }
  });
  return { validation, response, ownershipEvidence: [...ownership].sort(), ordering: [...new Set(ordering)] };
}

function inventory() {
  const app = readSource(path.join(ROOT, 'backend/src/app.js'));
  const controllers = new Map();
  const routes = [];
  const mounts = [];
  const descriptor = (node, context) => {
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(node.type)) return 'inline-handler';
    if (node.type === 'CallExpression') {
      const fn = member(node.callee);
      if (fn === 'requirePermission' || fn === 'authorize' || fn === 'responseContract') return context.text(node);
      if (fn.startsWith('upload.')) return context.text(node);
      return fn;
    }
    return member(node);
  };
  const processEndpoint = (context, node, prefix, inherited) => {
    const method = property(node.callee);
    const localPaths = literals(node.arguments[0]);
    if (!localPaths.length) throw new Error(`Unresolved route path in ${relative(context.file)}:${node.loc.start.line}`);
    const handlers = node.arguments.slice(1);
    const last = handlers.at(-1);
    const imported = context.imports.get(last?.object?.name || last?.name);
    let handlerContext = context;
    let handlerNode = last;
    let handlerName = 'inline';
    if (imported?.target.startsWith('.')) {
      const target = require.resolve(path.resolve(path.dirname(context.file), imported.target));
      if (!controllers.has(target)) controllers.set(target, readSource(target));
      handlerContext = controllers.get(target);
      handlerName = imported.exportName || property(last);
      handlerNode = handlerContext.exports.get(handlerName);
    }
    const middleware = [...inherited, ...handlers.slice(0, -1).map((h) => descriptor(h, context))];
    for (const local of localPaths) {
      const url = `${prefix}${local === '/' ? '' : local}` || '/';
      const classification = url.endsWith('/webhook') ? 'WEBHOOK'
        : url.startsWith('/health') || url.endsWith('/metrics') ? 'INTERNAL'
          : url === '/api/payments/cash' ? 'DEPRECATED'
            : url.startsWith('/api/admin') || url.startsWith('/api/v1/admin') || middleware.some((m) => m.startsWith('requirePermission(')) ? 'ADMIN'
              : url.startsWith('/api/v1/') ? 'CANONICAL_V1' : 'LEGACY_SUPPORTED';
      const auth = middleware.includes('authenticateAdmin') ? 'ADMIN_BEARER'
        : middleware.includes('authenticate') ? 'CUSTOMER_BEARER'
          : middleware.includes('authenticateOptional') ? 'OPTIONAL_CUSTOMER_BEARER'
            : classification === 'WEBHOOK' ? 'SIGNED_PROVIDER_PAYLOAD'
              : url === '/api/v1/admin/auth/refresh' ? 'ADMIN_REFRESH_COOKIE_AND_CSRF' : 'PUBLIC';
      routes.push({ method: method.toUpperCase(), path: url.replace(/:([A-Za-z0-9_]+)/g, '{$1}'), classification,
        auth, middleware, rateLimit: { global: url.startsWith('/health') ? null : { requests: 300, windowSeconds: 60 },
          additional: middleware.filter((m) => /limiter/i.test(m)) },
        registration: { file: relative(context.file), line: node.loc.start.line },
        handler: { file: relative(handlerContext.file), name: handlerName },
        domainAuthority: relative(handlerContext.file),
        ...endpointEvidence(handlerContext, handlerNode),
      });
    }
  };
  for (const statement of app.ast.program.body) {
    const node = statement.expression;
    if (node?.type !== 'CallExpression' || member(node.callee.object) !== 'app') continue;
    if (METHODS.has(property(node.callee))) processEndpoint(app, node, '', []);
    if (property(node.callee) !== 'use' || !literals(node.arguments[0]).length) continue;
    const imported = app.imports.get(node.arguments[1]?.name);
    if (!imported?.target.includes('/routes/')) continue;
    const prefix = node.arguments[0].value;
    const context = readSource(require.resolve(path.resolve(path.dirname(app.file), imported.target)));
    const inherited = [];
    // Earlier routers with a prefix may authenticate fall-through requests before this router.
    for (const mount of mounts) if (prefix.startsWith(`${mount.prefix}/`)) inherited.push(...mount.common);
    const common = [];
    for (const routeStatement of context.ast.program.body) {
      const call = routeStatement.expression;
      if (call?.type !== 'CallExpression' || member(call.callee.object) !== 'router') continue;
      if (property(call.callee) === 'use') {
        if (literals(call.arguments[0]).length) throw new Error('Path-scoped router.use needs an explicit inventory adapter.');
        const descriptors = call.arguments.map((h) => descriptor(h, context));
        inherited.push(...descriptors); common.push(...descriptors);
      } else if (METHODS.has(property(call.callee))) processEndpoint(context, call, prefix, inherited);
      else throw new Error(`Unsupported router declaration at ${relative(context.file)}:${call.loc.start.line}`);
    }
    mounts.push({ prefix, common });
  }
  routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`, 'en'));
  const keys = routes.map((route) => `${route.method} ${route.path}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate route registration requires shadowing review.');
  return routes;
}

function sourceFingerprint() {
  return createHash('sha256').update(files(path.join(ROOT, 'backend/src')).map((file) =>
    `${relative(file)}\n${fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')}`).join('\n')).digest('hex');
}

module.exports = { ROOT, METHODS, endpointEvidence, files, inventory, literals, member, property, readSource, relative, sourceFingerprint, walk };
