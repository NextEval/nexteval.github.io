import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
execFileSync('python3', [join(root, 'scripts/results-storage/public_results_build.py'), '--manifest', join(root, 'scripts/results-storage/reviewed-backlog22.manifest.json'), '--source', 'approved-public-release', '--overrides', join(root, 'scripts/results-storage/public-overrides.json'), '--output', join(root, 'bench/results')], { cwd: root, timeout: 300000, stdio: 'inherit' });
