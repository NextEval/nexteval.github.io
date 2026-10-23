"""Hash-bound names-only projection inside the existing static build lock."""
import copy,hashlib,json
from pathlib import Path

def digest(raw):return hashlib.sha256(raw).hexdigest()

def transform_app(source,import_path):
    begin=source.index('const labelFor = p => {');end=source.index('const detailFor =',begin)
    source=source[:begin]+"const labelFor = modelName;\nconst harnessFor = harnessName;\n"+source[end:]
    source=f"import {{ modelName, harnessName, configurationName, presentationParticipant }} from '{import_path}';\n"+source
    source=source.replace('`${labelFor(p)} / ${detailFor(p)}`','`${configurationName(p)} / ${harnessFor(p)}`')
    source=source.replace('${esc(p.label)}, ${esc(t.label)}','${esc(configurationName(p))}, ${esc(t.label)}')
    source=source.replace('${esc(participant.label)}','${esc(configurationName(participant))}')
    source=source.replace('${esc(snapshot.participants.find(p => p.participant_id === row.participant_id).label)}','${esc(configurationName(snapshot.participants.find(p => p.participant_id === row.participant_id)))}')
    old='snapshot = validateSnapshot(await readJSON(dataURL));'
    if source.count(old)!=1:raise ValueError('identity_snapshot_boundary')
    source=source.replace(old,old+'\n  snapshot = {...snapshot,participants:snapshot.participants.map(presentationParticipant)};',1)
    return source.encode()

def load_identity_presentation(manifest,registry_source):
    folder=Path(__file__).resolve().parent;path=Path(registry_source)
    if path.resolve()!=folder/'model-identities-v1.json' or path.is_symlink() or not path.is_file():raise ValueError('fixed_identity_registry_source')
    lock=json.loads((folder/'identity-presentation.lock.json').read_bytes());raw=path.read_bytes()
    if len(raw)>32768 or digest(raw)!=lock['registry_sha256']:raise ValueError('identity_registry_hash')
    registry=json.loads(raw)
    if registry['schema']!='nexteval.model-identities/1':raise ValueError('identity_registry_schema')
    fixture=folder/'identity-app-base.mjs';template=folder/'identity-labels-template.mjs'
    for p,pin in ((fixture,lock['base_app_sha256']),(template,lock['template_sha256'])):
        if p.is_symlink() or not p.is_file() or digest(p.read_bytes())!=pin:raise ValueError('identity_source_hash')
    base=fixture.read_text();body='export const MODEL_IDENTITIES = Object.freeze('+json.dumps(registry,ensure_ascii=True,separators=(',',':'))+');\n'+template.read_text()
    assets={'dist/results/identities.mjs':body.encode()}
    for target,relative in [('dist/results/app.mjs','./identities.mjs'),('dist/results/archive/ten-repeat/app.mjs','../../identities.mjs')]:
        if manifest['files'][target]['sha256']!=lock['base_app_sha256']:raise ValueError('identity_app_preimage')
        assets[target]=transform_app(base,relative)
    if {k:{'sha256':digest(v),'bytes':len(v)} for k,v in assets.items()}!=lock['targets']:raise ValueError('identity_projection_hash')
    return {'assets':assets,'lock':lock}

def identity_effective_manifest(manifest,projection):
    effective=copy.deepcopy(manifest)
    for name,raw in projection['assets'].items():effective['files'][name]={'bytes':len(raw),'sha256':digest(raw)}
    return effective

def apply_identity_presentation(output,projection):
    output=Path(output)
    for name in projection['assets']:
        relative=name.removeprefix('dist/results/')
        if relative not in ('app.mjs','archive/ten-repeat/app.mjs','identities.mjs'):raise ValueError('identity_target_not_allowed')
        p=output/relative
        if p.is_symlink():raise ValueError('identity_target_symlink')
        if relative!='identities.mjs' and digest(p.read_bytes())!=projection['lock']['base_app_sha256']:raise ValueError('identity_target_preimage')
        if relative=='identities.mjs' and p.exists():raise ValueError('unexpected_identity_target')
    for name,raw in projection['assets'].items():(output/name.removeprefix('dist/results/')).write_bytes(raw)
