const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('notification HTTP routes cannot create arbitrary recipient notifications', () => {
  const routes = source('src/routes/notification.routes.js');
  const controller = source('src/controllers/notification.controller.js');
  assert.doesNotMatch(routes, /router\.post\(\s*['"]\/['"]/);
  assert.doesNotMatch(controller, /exports\.createNotification/);
});

test('review routes enforce client and professional roles while public reads are moderated', () => {
  const routes = source('src/routes/review.routes.js');
  const controller = source('src/controllers/review.controller.js');
  assert.match(routes, /authorize\('CLIENT'\)/);
  assert.match(routes, /authorize\('PROFESSIONAL'\)/);
  assert.match(controller, /isVisible:\s*true/);
  assert.match(controller, /booking\.status\s*!==\s*'COMPLETED'/);
  assert.doesNotMatch(controller, /booking\.userId|prisma\.professional\.|professionalResponse|respondedAt|NEW_REVIEW/);
});

test('legacy authenticated identity selection excludes credentials and provider fields', () => {
  const auth = source('src/middleware/auth.js');
  const selection = auth.slice(auth.indexOf('select: {'), auth.indexOf('});', auth.indexOf('select: {')));
  assert.doesNotMatch(selection, /passwordHash|stripeAccountId|refreshToken|termsVersion|privacyVersion/);
});

test('identity security migration is additive, default-deny and contains no destructive data operation', () => {
  const migration = source('prisma/migrations/202609110002_customer_identity_security/migration.sql');
  assert.match(migration, /CREATE TABLE "CustomerSession"/);
  assert.match(migration, /CREATE TABLE "CustomerRefreshToken"/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE)\b/im);
});
