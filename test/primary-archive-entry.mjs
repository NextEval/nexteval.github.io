import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../bench/index.html',import.meta.url),'utf8');
const archive=readFileSync(new URL('../bench/ten-repeat.html',import.meta.url),'utf8');
assert(html.includes('href="ten-repeat.html#matrix"'));assert(html.includes("import('./results/app.mjs?"));
assert(archive.includes("import('./results/archive/ten-repeat/app.mjs?"));assert(!archive.includes("import('./results/app.mjs?"));
assert(archive.includes('results/archive/ten-repeat/results.css?'));assert(archive.includes('href="assets/brand/nexteval.svg"'));assert(archive.includes('src="vendor/lucide.min.js"'));
console.log('Primary and complete ten-repeat archive entry routes verified');
