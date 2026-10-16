const assert = (value, message) => { if (!value) throw new Error(message); };
export const MIMO_SCHEMA = 'nexteval.mimo-exact-terminal-evidence-digest/1';
const trial = '198adef3295c42acadd825f313789441';
const participant = 'claude-code--mimo-v2.6-flash--off';
const archive = '20261015T235905Z-3456243a10b943e5a57cd2fbc4138fca';
const hdf = '8540e1f350a61a1fba003458796b7a5cf717178073aec93030128d78f5525eec';
const rowmap = '924f5494658baf6dac9dc0c5a5567ceb81d1b15b24ee338a6c5e31157a27b586';
const review = 'd3d7f5c22c5686f838085654b16df553d8aab29877fb9c0ee1a9961a758baea4';
const hashes = {
  'manifest.json': '31cbb48c8e52ae81ea94007539f84007b330209b5c45a8ba18c32a1a25a7ccff',
  'result.json': '267bea88328341d3d3bc0b594592d2386497756080323df2498881b8f8184fdf',
  'scoring-history.json': '0b6f79e87252896e52491bcb99a39c2fafb39ea7a0dbc7a4c418c21dc5432d1e',
};
const keys = (object, expected) => assert(object && !Array.isArray(object)
  && JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...expected].sort()), 'MiMo evidence fields changed');
const exactHashes = value => {
  keys(value, Object.keys(hashes));
  assert(Object.entries(hashes).every(([key, sha]) => value[key] === sha), 'MiMo scientific hash binding changed');
};

export function validateExactMimoTerminalReview(doc, source) {
  keys(doc, ['schema','review_schema','treatment_id','participant_id','task_id','selected_cells','profile_row_map_sha256','review_sha256','permits']);
  assert(doc.schema === MIMO_SCHEMA && doc.review_schema === 'nexteval.mimo-exact-cancelled-failure/1'
    && doc.treatment_id === null && doc.participant_id === participant && doc.task_id === 'nexteval-u5-perturbed@1'
    && doc.selected_cells === 920 && doc.profile_row_map_sha256 === rowmap && doc.review_sha256 === review,
  'MiMo exact terminal source binding changed');
  assert(source.archive_id === archive && source.participant_id === participant && source.numeric_h5_sha256 === hdf
    && source.profile_row_map_sha256 === rowmap && source.reviewed_terminal_evidence.review_sha256 === review
    && source.reviewed_terminal_evidence.agent_failure_count === 1
    && source.exact_terminal_adapter?.sha256 === 'd048267ec852b930af22d5337ca92c6156790414420c2b5476ed95afff848273',
  'MiMo source adapter binding changed');
  assert(Array.isArray(doc.permits) && doc.permits.length === 1, 'MiMo requires one exact permit');
  const p = doc.permits[0];
  keys(p, ['trial_id','decision','normal_completion','valid_failure_coverage','retry_required','cause','caller','device',
    'oracle_evaluations','original_termination','original_runtime_status','historical_native_exception','normal_2B_exit_certified',
    'original_parent_selection_sha256','source_sha256','notes']);
  assert(p.trial_id === trial && p.decision === 'retain_terminal_cancelled_failure' && p.normal_completion === false
    && p.valid_failure_coverage === true && p.retry_required === false && p.cause === 'UNKNOWN' && p.caller === 'UNKNOWN'
    && p.device === 'Linux' && p.oracle_evaluations === 50 && p.original_termination === 'call_limit_reached'
    && p.original_runtime_status === 'call_limit_reached' && p.historical_native_exception === 'CancelledError'
    && p.normal_2B_exit_certified === false
    && p.original_parent_selection_sha256 === '7a1b75b53566bff2fb4c1ca9684347925e5a0d5f071ac4403160db79be0bc7f2',
  'MiMo exact cancelled failure decision changed');
  assert(JSON.stringify(p.notes) === JSON.stringify(['cancellation-cause-unknown','caller-unknown','source-hashes-reviewed','native-digest-only']), 'MiMo uncertainty notes changed');
  exactHashes(p.source_sha256);
  return doc;
}

export function validateExactMimoHistory(row, note, permit) {
  if (row.attempt_id !== trial || permit.trial_id !== trial) throw new Error('MiMo history attempt binding changed');
  assert(row.participant_id === participant && row.archive_id === archive && row.terminal_status === 'agent_failure'
    && row.runtime_status === 'call_limit_reached' && row.evaluations === 50 && Array.isArray(row.values) && row.values.length === 50,
  'MiMo history outcome binding changed');
  assert(note && note.decision === permit.decision && note.cause === 'UNKNOWN' && note.caller === 'UNKNOWN', 'MiMo history annotation binding changed');
  exactHashes(note.source_sha256);
  return row;
}
