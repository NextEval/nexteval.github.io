import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from test_public_usage_overlay import fixture
from public_usage_overlay import validate_usage,apply_overlay

class CurrentUsageTests(unittest.TestCase):
 def test_explicit_group_count_not_a_historical_constant(self):
  d=fixture()
  for i in range(24):g=copy.deepcopy(d['groups'][0]);g['participant_id']='new'+str(i);d['groups'].append(g)
  self.assertIs(validate_usage(d,109),d)
  with self.assertRaisesRegex(ValueError,'membership'):validate_usage(d,108)
 def test_token_ready_does_not_require_prices(self):
  d=fixture();g=d['groups'][0];g.update(cost_known_runs=0,total_api_equivalent_cost_usd=None,mean_api_equivalent_cost_usd_per_run=None,accounting_status='tokens_only',pricing_sources=[]);validate_usage(d)
 def test_selection_swap_between_configurations_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'data').mkdir();price=b'{}';(root/'data/pricing-snapshot.json').write_bytes(price)
   d=fixture();d['groups']=d['groups'][:2];a,b=d['groups'];a['selection_sha256']='a'*64;b['selection_sha256']='b'*64
   task=a['task_id'];snapshot={'tasks':[{'task_id':task,'members':[a['participant_id'],b['participant_id'],'cobyqa'],'scores':[{'participant_id':a['participant_id']},{'participant_id':b['participant_id']}],'evidence_refs':[{'participant_id':a['participant_id'],'primary_selection':{'selection_sha256':'a'*64}},{'participant_id':b['participant_id'],'primary_selection':{'selection_sha256':'b'*64}}]}]}
   raw=json.dumps(snapshot).encode();(root/'data/results.json').write_bytes(raw);(root/'data/website-usage.json').write_bytes(b'{}')
   d['pricing_sha256']=hashlib.sha256(price).hexdigest();config={'source_results_sha256':hashlib.sha256(raw).hexdigest(),'selection_bindings':{task+'|'+a['participant_id']:'a'*64,task+'|'+b['participant_id']:'b'*64}}
   apply_overlay({'data':d,'config':config,'raw':json.dumps(d).encode()},root)
   del snapshot['tasks'][0]['evidence_refs'][0]['participant_id'];raw=json.dumps(snapshot).encode();(root/'data/results.json').write_bytes(raw);config['source_results_sha256']=hashlib.sha256(raw).hexdigest();apply_overlay({'data':d,'config':config,'raw':json.dumps(d).encode()},root)
   a['selection_sha256'],b['selection_sha256']=b['selection_sha256'],a['selection_sha256'];config['selection_bindings']={task+'|'+g['participant_id']:g['selection_sha256'] for g in d['groups']}
   with self.assertRaisesRegex(ValueError,'exact_selected_source_binding'):apply_overlay({'data':d,'config':config,'raw':json.dumps(d).encode()},root)

if __name__=='__main__':unittest.main()
