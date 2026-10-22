import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { applyPlan } from './apply-public-plan.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
try { console.log(JSON.stringify(applyPlan(join(root, 'bench/results')))); }
catch {
  execFileSync('python3', [join(root, 'scripts/results-storage/public_results_build.py'), '--manifest', join(root, 'scripts/results-storage/reviewed-backlog22.manifest.json'), '--source', 'approved-public-release', '--output', join(root, 'bench/results')], { cwd: root, timeout: 300000, stdio: 'inherit' });
  console.log(JSON.stringify(applyPlan(join(root, 'bench/results'))));
}
