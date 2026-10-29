import {execFileSync} from 'node:child_process';
execFileSync('python3',['-m','unittest','test_identity_presentation.py'],{cwd:new URL('../scripts/results-storage/',import.meta.url),stdio:'inherit'});
