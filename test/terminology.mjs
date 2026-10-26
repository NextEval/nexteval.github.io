import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Presentation copy is mutable; experiment prompts and cited titles are not.
for (const file of ['index.html', 'solver/index.html', 'bench/index.html', 'bench/ten-repeat.html', 'bench/archive.html']) {
  const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /black[\s-]*box/iu, file);
  assert.match(text, /derivative-free/iu, file);
}
console.log('Public presentation terminology matches derivative-free optimization.');
