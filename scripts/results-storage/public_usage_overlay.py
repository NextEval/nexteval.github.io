"""Strict public accounting overlay; private ledgers never enter deployment assets."""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit

TARGET='dist/results/data/website-usage.json'
ROOT_KEYS={'generated_at','pricing_as_of','pricing_snapshot_id','pricing_sha256','cost_basis','source_usage_sha256','schema','groups','pricing_file','primary_protocol','accounting_derivation'}
GROUP_KEYS={'participant_id','task_id','runs','usage_known_runs','cost_known_runs','total_tokens','mean_total_tokens_per_run','total_api_equivalent_cost_usd','mean_api_equivalent_cost_usd_per_run','pricing_as_of','pricing_sources','accounting_status','selection_sha256','primary_protocol'}
def require(ok,message):
    if not ok:raise ValueError(message)
def digest(data):return hashlib.sha256(data).hexdigest()
def number(n):return type(n) in (int,float) and math.isfinite(n) and n>=0
def hash_value(v):return isinstance(v,str) and re.fullmatch('[0-9a-f]{64}',v) is not None
def privacy(value):
    if isinstance(value,str):
        require(not re.search(r'(?:/(?:home|Users)/|github_pat_|gh[pousr]_[A-Za-z0-9]{20}|sk-[A-Za-z0-9_-]{20}|Bearer\s|https?://[^\s]*[?&](?:token|signature|X-Amz-))',value,re.I),'private_value')
    elif isinstance(value,dict):
        for key,item in value.items():
            require(not re.search(r'^(?:api_key|access_token|refresh_token|authorization|password|messages|raw_log|requests|per_model|attempts|source_directory)$',key,re.I),'private_field');privacy(item)
    elif isinstance(value,list):
        for item in value:privacy(item)

def validate_usage(data, expected_groups=85):
    require(isinstance(data,dict) and not set(data)-ROOT_KEYS and data.get('schema')=='nexteval.website-usage/1','usage_schema')
    require(data.get('primary_protocol')=={'id':'fixed-original-seed-prefix/3','seed_ordinals':[0,1,2],'expected':276},'selection_protocol')
    require(hash_value(data.get('pricing_sha256')) and hash_value(data.get('source_usage_sha256')),'accounting_source_hashes')
    require(data.get('pricing_file')=='pricing-snapshot.json' and isinstance(data.get('groups'),list) and len(data['groups'])==expected_groups,'usage_membership')
    privacy(data);seen=set()
    for g in data['groups']:
        require(isinstance(g,dict) and set(g)==GROUP_KEYS,'public_aggregate_fields')
        key=(g['task_id'],g['participant_id']);require(key not in seen,'duplicate_usage_identity');seen.add(key)
        require(type(g['runs']) is int and g['runs']==276 and type(g['usage_known_runs']) is int and type(g['cost_known_runs']) is int and 0<=g['cost_known_runs']<=g['usage_known_runs']<=276,'accounting_coverage')
        require(g['primary_protocol']=='fixed-original-seed-prefix/3' and hash_value(g['selection_sha256']),'group_selection_binding')
        require(g['accounting_status']==('complete' if g['cost_known_runs']==276 else 'tokens_only' if g['usage_known_runs']==276 else 'incomplete'),'accounting_status')
        for prefix,mean,total,count in (('token','mean_total_tokens_per_run','total_tokens','usage_known_runs'),('cost','mean_api_equivalent_cost_usd_per_run','total_api_equivalent_cost_usd','cost_known_runs')):
            if g[count]<276:require(g[mean] is None and g[total] is None,'unknown_'+prefix+'_must_be_null')
            else:
                require(number(g[mean]) and number(g[total]),'invalid_'+prefix+'_number')
                require(abs(g[mean]*276-g[total])<=max(1e-6,g[total]*1e-8),'mean_total_mismatch')
        if g['total_tokens'] is not None:require(type(g['total_tokens']) is int,'integer_tokens')
        require(g['pricing_as_of']==data['pricing_as_of'] and re.fullmatch(r'\d{4}-\d{2}-\d{2}',g['pricing_as_of']) is not None,'pricing_date')
        require(isinstance(g['pricing_sources'],list),'pricing_sources')
        for source in g['pricing_sources']:
            parts=urlsplit(source);require(parts.scheme=='https' and parts.netloc and not parts.username and not parts.password,'pricing_url')
        if g['cost_known_runs']==276:require(bool(g['pricing_sources']),'priced_source_missing')
    return data

def load_overlay(manifest,config_path,manifest_sha256):
    config_path=Path(config_path);require(config_path.is_file() and not config_path.is_symlink(),'overlay_config_file')
    config=json.loads(config_path.read_bytes())
    require(set(config)=={'schema','base_manifest_sha256','source_results_sha256','private_derivation_sha256','selection_bindings','overrides'},'overlay_config_fields')
    require(config['schema']=='nexteval.public-aggregate-overlay/1' and config['base_manifest_sha256']==manifest_sha256,'base_manifest_binding')
    require(hash_value(config['private_derivation_sha256']) and config['source_results_sha256']==manifest['files']['dist/results/data/results.json']['sha256'],'science_source_binding')
    require(len(config['overrides'])==1,'one_accounting_overlay_only');item=config['overrides'][0]
    require(set(item)=={'target','source','base_sha256','sha256','bytes'} and item['target']==TARGET,'only_accounting_target')
    require(item['base_sha256']==manifest['files'][TARGET]['sha256'],'base_accounting_binding')
    require(isinstance(item['source'],str) and re.fullmatch(r'[A-Za-z0-9_-]+\.json',item['source']) is not None,'source_basename')
    source=config_path.parent/item['source'];require(source.is_file() and not source.is_symlink() and source.stat().st_size<=262144,'bounded_public_aggregate')
    raw=source.read_bytes();require(type(item['bytes']) is int and item['bytes']==len(raw) and digest(raw)==item['sha256'],'overlay_source_digest')
    require(isinstance(config['selection_bindings'],dict) and 0<len(config['selection_bindings'])<=2000 and all(hash_value(v) for v in config['selection_bindings'].values()),'selection_bindings');data=validate_usage(json.loads(raw),len(config['selection_bindings']))
    effective=deepcopy(manifest);effective['files'][TARGET]={'bytes':len(raw),'sha256':digest(raw)}
    return {'manifest':effective,'raw':raw,'data':data,'config':config}

def apply_overlay(overlay,output):
    output=Path(output);snapshot_path=output/'data/results.json';snapshot=json.loads(snapshot_path.read_bytes())
    require(digest(snapshot_path.read_bytes())==overlay['config']['source_results_sha256'],'science_changed')
    sources={}
    aliases={'codex--gpt-5.5--high--api':'codex--gpt-5.5--high','codex--gpt-5.5--medium--mixed-api40':'codex--gpt-5.5--medium'}
    for task in snapshot['tasks']:
        members=[p for p in task['members'] if p!='cobyqa']
        refs=task.get('evidence_refs',[])
        require(len(members)==len(refs) and len(set(members))==len(members),'ordered_source_membership')
        for pid,source in zip(members,refs):
            claimed=source.get('participant_id',pid)
            require(aliases.get(claimed,claimed)==aliases.get(pid,pid),'source_participant_binding')
            sources[(task['task_id'],pid)]=source.get('primary_selection',{}).get('selection_sha256')
    expected={(t['task_id'],s['participant_id']) for t in snapshot['tasks'] for s in t['scores'] if s['participant_id']!='cobyqa'}
    observed={(g['task_id'],g['participant_id']) for g in overlay['data']['groups']};require(observed==expected,'scored_group_membership')
    require(digest((output/'data/pricing-snapshot.json').read_bytes())==overlay['data']['pricing_sha256'],'pricing_changed')
    for g in overlay['data']['groups']:
        key=g['task_id']+'|'+g['participant_id']
        require(sources.get((g['task_id'],g['participant_id']))==g['selection_sha256'] and overlay['config']['selection_bindings'].get(key)==g['selection_sha256'],'exact_selected_source_binding')
    target=output/'data/website-usage.json';require(target.is_file() and not target.is_symlink(),'existing_public_accounting_file')
    with target.open('wb') as f:f.write(overlay['raw'])
