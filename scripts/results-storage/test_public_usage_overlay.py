import copy,unittest
from public_usage_overlay import validate_usage,privacy
def fixture():
    groups=[{'participant_id':'method'+str(n),'task_id':'feature@1','runs':276,'usage_known_runs':276,'cost_known_runs':276,'total_tokens':27600,'mean_total_tokens_per_run':100.,'total_api_equivalent_cost_usd':2.76,'mean_api_equivalent_cost_usd_per_run':.01,'pricing_as_of':'2026-10-09','pricing_sources':['https://example.org/pricing'],'accounting_status':'complete','selection_sha256':'a'*64,'primary_protocol':'fixed-original-seed-prefix/3'} for n in range(85)]
    return dict(schema='nexteval.website-usage/1',groups=groups,pricing_sha256='b'*64,source_usage_sha256='c'*64,pricing_file='pricing-snapshot.json',primary_protocol={'id':'fixed-original-seed-prefix/3','seed_ordinals':[0,1,2],'expected':276},pricing_as_of='2026-10-09')
class Tests(unittest.TestCase):
    def test_valid_aggregates(self):self.assertIs(validate_usage(d:=fixture()),d)
    def test_old_denominator_rejected(self):
        d=fixture();d['groups'][0]['runs']=920
        with self.assertRaisesRegex(ValueError,'accounting_coverage'):validate_usage(d)
    def test_missing_usage_is_not_zero(self):
        d=fixture();g=d['groups'][0];g.update(usage_known_runs=275,cost_known_runs=275,accounting_status='incomplete')
        with self.assertRaisesRegex(ValueError,'must_be_null'):validate_usage(d)
        for key in ('total_tokens','mean_total_tokens_per_run','total_api_equivalent_cost_usd','mean_api_equivalent_cost_usd_per_run'):g[key]=None
        validate_usage(d)
    def test_no_private_per_trial_fields(self):
        for key in ('requests','attempts','messages','source_directory'):
            d=fixture();d['groups'][0][key]=[]
            with self.assertRaises(ValueError):validate_usage(d)
    def test_private_values_rejected(self):
        for s in ('/home/owner/raw','Bearer abc','https://example.org/a?token=abc'):
            with self.assertRaisesRegex(ValueError,'private_value'):privacy(s)
    def test_duplicate_and_missing_groups(self):
        d=fixture();d['groups'][0]=copy.deepcopy(d['groups'][1])
        with self.assertRaisesRegex(ValueError,'duplicate'):validate_usage(d)
        d=fixture();d['groups'].pop()
        with self.assertRaisesRegex(ValueError,'membership'):validate_usage(d)
    def test_total_and_mean_must_match(self):
        d=fixture();d['groups'][0]['mean_total_tokens_per_run']=110
        with self.assertRaisesRegex(ValueError,'mismatch'):validate_usage(d)
    def test_protocol_binding(self):
        d=fixture();d['primary_protocol']['seed_ordinals']=[0,1,3]
        with self.assertRaisesRegex(ValueError,'protocol'):validate_usage(d)
if __name__=='__main__':unittest.main()
