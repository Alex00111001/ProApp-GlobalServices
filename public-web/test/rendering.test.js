const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('public pages fetch approved server content and generate metadata before render', () => {
  const source = fs.readFileSync(path.join(root, 'app/[marketCode]/[locale]/[type]/[slug]/page.tsx'), 'utf8');
  assert.match(source, /generateMetadata/);
  assert.match(source, /await fetchPage/);
  assert.match(source, /languages: page\.seo\.alternates/);
  assert.match(source, /notFound\(\)/);
  assert.doesNotMatch(source, /use client|dangerouslySetInnerHTML|Math\.random/);
});
test('sitemap escapes API output and robots default to no crawling while markets are inactive', () => {
  const sitemap = fs.readFileSync(path.join(root, 'app/[marketCode]/[locale]/sitemap.xml/route.ts'), 'utf8');
  const robots = fs.readFileSync(path.join(root, 'app/robots.ts'), 'utf8');
  assert.match(sitemap, /escape\(url\.location\)/);
  assert.match(robots, /disallow: '\/'/);
});
test('public API client is server-only and treats inactive or unsupported content as absent', () => {
  const source = fs.readFileSync(path.join(root, 'lib/content-api.ts'), 'utf8');
  assert.match(source, /import 'server-only'/);
  assert.match(source, /response\.status === 404 \|\| response\.status === 503/);
  assert.doesNotMatch(source, /localStorage|document\.|window\./);
});
test('SSR proxy enforces configured internal redirects, 410 retirement and nonce CSP', () => {
  const source = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8');
  assert.match(source, /\[301, 308, 410\]/);
  assert.match(source, /status: 410/);
  assert.match(source, /safeInternalPath/);
  assert.match(source, /'nonce-\$\{nonce\}'/);
  assert.doesNotMatch(source, /unsafe-inline'.*script-src|targetPath\.startsWith\('http/);
});
