"""Exact public mobile-header stylesheet projection; numerical files are untouched."""
import copy
import hashlib
from pathlib import Path

KEY = 'dist/results/results.css'
BASE = {'bytes': 18509, 'sha256': 'd030794e288f9549726cc92b4b32866184200dcc4cde7e824c86b629e06f5d8c'}
TARGET = {'bytes': 18668, 'sha256': '7d12fdf56113dbe7808ba8fae147a6e1fe7470fbc1e7e429ab9170caf29dd17f'}
SUFFIX = b'\n@media(max-width:520px) { .results-header { flex-wrap:wrap; padding-top:12px; padding-bottom:12px; } .results-header nav { flex-wrap:wrap; gap:10px 15px; } }\n'

def project(data):
    pin = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    if pin == TARGET:
        return data
    if pin != BASE:
        raise ValueError('unknown_mobile_css_preimage')
    result = data + SUFFIX
    assert {'bytes': len(result), 'sha256': hashlib.sha256(result).hexdigest()} == TARGET
    return result

def effective_manifest(manifest):
    if manifest['files'][KEY] not in (BASE, TARGET):
        raise ValueError('unknown_mobile_css_manifest')
    result = copy.deepcopy(manifest)
    result['files'][KEY] = dict(TARGET)
    return result

def apply(output):
    path = Path(output) / 'results.css'
    if path.is_symlink():
        raise ValueError('mobile_css_symlink')
    data = path.read_bytes()
    result = project(data)
    if result != data:
        path.write_bytes(result)

