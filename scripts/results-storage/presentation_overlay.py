"""Hash-bound UI-only projection; experiment data and frozen scores are immutable."""
import copy
import hashlib
import json
from pathlib import Path

TARGETS = ('app.mjs', 'archive/ten-repeat/app.mjs', 'pareto.mjs',
           'archive/ten-repeat/pareto.mjs', 'index.html', 'usage-estimates.html', 'presentation.mjs', 'archive/ten-repeat/index.html')
SOURCES = ('app.mjs', 'pareto.mjs', 'index.html', 'usage-estimates.html', 'presentation.mjs', 'archive-index.html')
PREFIX = 'dist/results/'
def pin(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

def load(manifest):
    folder = Path(__file__).resolve().parent.parent / 'results-ui'
    lock = json.loads((folder / 'presentation.lock.json').read_bytes())
    if set(lock['sources']) != set(SOURCES) or set(lock['targets']) != set(TARGETS) or set(lock['preimages']) != set(TARGETS):
        raise ValueError('fixed_presentation_targets')
    source = {}
    for name in SOURCES:
        path = folder / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('presentation_source_type')
        raw = path.read_bytes()
        if pin(raw) != lock['sources'][name]:
            raise ValueError('presentation_source_hash')
        source[name] = raw
    assets = {name: raw for name, raw in source.items() if name != 'archive-index.html'}
    assets['archive/ten-repeat/index.html'] = source['archive-index.html']
    assets['archive/ten-repeat/app.mjs'] = source['app.mjs'].replace(
        b"from './identities.mjs'", b"from '../../identities.mjs'").replace(
        b"from './presentation.mjs'", b"from '../../presentation.mjs'")
    assets['archive/ten-repeat/pareto.mjs'] = source['pareto.mjs']
    if {name: pin(raw) for name, raw in assets.items()} != lock['targets']:
        raise ValueError('presentation_target_hash')
    before = all(manifest['files'].get(PREFIX + name) == value for name, value in lock['preimages'].items())
    after = all(manifest['files'].get(PREFIX + name) == value for name, value in lock['targets'].items())
    if not before and not after:
        raise ValueError('presentation_manifest_preimage')
    return {'assets': assets, 'lock': lock, 'input_state': 'projected' if after else 'base'}

def effective_manifest(manifest, projection):
    result = copy.deepcopy(manifest)
    for name, raw in projection['assets'].items():
        result['files'][PREFIX + name] = pin(raw)
    return result

def apply(output, projection):
    root = Path(output)
    pins = projection['lock']['targets'] if projection['input_state'] == 'projected' else projection['lock']['preimages']
    for name in TARGETS:
        path = root / name
        if path.is_symlink():
            raise ValueError('presentation_target_symlink')
        expected = pins.get(name)
        if expected is None:
            if path.exists():
                raise ValueError('unexpected_presentation_target')
        elif not path.is_file() or pin(path.read_bytes()) != expected:
            raise ValueError('presentation_target_preimage')
    for name, raw in projection['assets'].items():
        (root / name).write_bytes(raw)
