import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../bench/index.html',import.meta.url),'utf8');
const archive=readFileSync(new URL('../bench/ten-repeat.html',import.meta.url),'utf8');
assert(!html.includes('href="ten-repeat.html#matrix"'));assert(html.includes("import('./results/app.mjs?"));
assert(archive.includes("location.replace('./#matrix')"));assert(!archive.includes("import('./results/archive/"));
assert(readFileSync(new URL('../bench/archive.html',import.meta.url),'utf8').includes("location.replace('./#matrix')"));
console.log('Current result entry retained; historical display entry routes redirect to current results');
