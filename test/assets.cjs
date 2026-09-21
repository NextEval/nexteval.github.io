const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'bench/assets/comparisons/index.json')));
let curves = 0;
for (const scope of manifest.scopes) {
  for (const [mask, expected] of Object.entries(scope.subsets)) {
    const relative = `bench/assets/comparisons/${scope.id}/${mask}.json.gz`;
    assert(tracked.has(relative), `Required profile asset is not tracked by Git: ${relative}`);
    const bytes = fs.readFileSync(path.join(root, relative));
    assert.equal(bytes.length, expected.bytes, `Size mismatch: ${relative}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `Hash mismatch: ${relative}`);
    const data = JSON.parse(gunzipSync(bytes));
    assert.equal(data.scope, scope.id);
    assert.equal(data.problems, scope.problems);
    assert.equal(data.repeats, scope.repeats);
    assert.equal(data.new_evaluations, 0);
    curves++;
  }
}
console.log(`Verified ${curves} tracked profile assets in ${manifest.scopes.length} comparison scopes.`);
