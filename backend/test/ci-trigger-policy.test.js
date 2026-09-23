const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/ci.yml'), 'utf8');

test('Platform verification reserves feature-branch CI for an explicit block closure', () => {
  assert.match(workflow, /pull_request:\r?\n\s+branches:\r?\n\s+- main/);
  assert.match(workflow, /push:\r?\n\s+branches:\r?\n\s+- main/);
  assert.match(workflow, /- "ci\/closure\/\*\*"/);
  assert.doesNotMatch(workflow, /- "feature\/\*\*"/);
  assert.match(workflow, /workflow_dispatch:\r?\n\s+inputs:\r?\n\s+evidence_scope:/);
  assert.match(workflow, /- block-closure/);
});
