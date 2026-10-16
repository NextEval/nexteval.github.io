import { MIMO_SCHEMA, validateExactMimoTerminalReview } from './mimo-evidence.mjs';
import { assetPath } from './model.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uncertaintyNotes = ['scientific-deadline-verified','strict-trace-not-verified','session-tail-closure-unknown'];
const noteCodes = ['cancellation-cause-unknown','caller-unknown','source-hashes-reviewed','cross-device-source','native-digest-only', ...uncertaintyNotes];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const keys = (obj, allowed) => assert(obj && typeof obj === 'object' && !Array.isArray(obj)
  && Object.keys(obj).every(key => allowed.includes(key)), 'Unexpected evidence field');

export function validateSourceNotes(source) {
  const provenance = source.execution_environment;
  if (provenance !== undefined) {
    keys(provenance, ['device','campaign_id','parser','provider_account','provider_thinking_verified','usage','cost_usd','notes','strict_trace_verified']);
    assert(['Mac','Linux','UNKNOWN'].includes(provenance.device), 'Invalid device');
    assert(provenance.campaign_id === null || (typeof provenance.campaign_id === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(provenance.campaign_id)), 'Invalid campaign');
    assert(Array.isArray(provenance.notes) && new Set(provenance.notes).size === provenance.notes.length && provenance.notes.every(note => noteCodes.includes(note)), 'Unsafe public notes');
    const uncertainty = provenance.notes.some(n => uncertaintyNotes.includes(n));
    assert(uncertainty ? provenance.strict_trace_verified === false && uncertaintyNotes.every(n => provenance.notes.includes(n))
      : provenance.strict_trace_verified === undefined, 'Unbound strict trace uncertainty');
    keys(provenance.parser, ['id','sha256']);
    assert(provenance.parser.id === null || (typeof provenance.parser.id === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(provenance.parser.id)), 'Invalid parser');
    assert(provenance.parser.sha256 === null || hash(provenance.parser.sha256), 'Invalid parser hash');
    for (const key of ['provider_account','provider_thinking_verified','usage','cost_usd']) assert(provenance[key] === null, 'Unknown provenance cannot be asserted');
  }
  if (source.reviewed_terminal_evidence !== undefined) {
    const ref = source.reviewed_terminal_evidence;
    keys(ref, ['path','sha256','review_sha256','agent_failure_count','cause','caller']);
    assert(/^evidence\/reviewed-terminal-[a-f0-9]{64}\.json$/.test(assetPath(ref.path)), 'Invalid terminal evidence path');
    assert(hash(ref.sha256) && ref.path.includes(ref.sha256) && hash(ref.review_sha256), 'Unbound evidence digest');
    assert(Number.isInteger(ref.agent_failure_count) && ref.agent_failure_count > 0 && ref.agent_failure_count <= 14
      && ref.cause === 'UNKNOWN' && ref.caller === 'UNKNOWN', 'Invalid reviewed failure count or cause');
  }
  return source;
}

export function sourceNotesTable(sources, fileURL) {
  if (!sources.some(source => source.execution_environment || source.reviewed_terminal_evidence)) return '';
  const rows = sources.map(source => {
    validateSourceNotes(source);
    const p = source.execution_environment;
    const review = source.reviewed_terminal_evidence;
    const link = review ? `<a href="${escape(fileURL(assetPath(review.path)))}" download>Reviewed terminal evidence</a><br>${review.agent_failure_count} agent failures; terminal/cancellation cause UNKNOWN<br>SHA-256 <code>${escape(review.sha256)}</code>` : 'No terminal override';
    const uncertainty = p?.strict_trace_verified === false ? '<br>Scientific deadline verified; strict trace not verified; session-tail closure UNKNOWN.' : '';
    return `<tr><td><code>${escape(source.archive_id)}</code></td><td>${escape(p?.device ?? 'UNKNOWN')}</td><td><code>${escape(p?.campaign_id ?? 'UNKNOWN')}</code></td><td>${escape(p?.parser?.id ?? 'UNKNOWN')}${p?.parser?.sha256 ? `<br><code>${escape(p.parser.sha256)}</code>` : ''}</td><td>${link}${uncertainty}</td></tr>`;
  }).join('');
  return `<div class="results-table-scroll"><table class="source-notes-table"><thead><tr><th>Source</th><th>Device</th><th>Campaign</th><th>Parser</th><th>Terminal review</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function validatePublicTerminalReview(doc, source) {
  if (doc?.schema === MIMO_SCHEMA) return validateExactMimoTerminalReview(doc, source);
  const ref=source.reviewed_terminal_evidence;
  keys(doc,['schema','review_schema','treatment_id','participant_id','task_id','selected_cells','profile_row_map_sha256','review_sha256','permits','campaign_id']);
  assert(doc.schema==='nexteval.reviewed-terminal-evidence-digest/1' && doc.review_schema==='nexteval.reviewed-terminal-evidence/1' && doc.selected_cells===920
    && doc.participant_id===source.participant_id && doc.review_sha256===ref.review_sha256
    && doc.profile_row_map_sha256===source.profile_row_map_sha256, 'Terminal source binding changed');
  assert(Array.isArray(doc.permits) && doc.permits.length===ref.agent_failure_count
    && new Set(doc.permits.map(p=>p.trial_id)).size===doc.permits.length, 'Duplicate or missing terminal permit');
  for(const p of doc.permits){
    keys(p,['trial_id','decision','normal_completion','valid_failure_coverage','retry_required','cause','caller','notes','device','source_sha256']);
    assert(/^[a-f0-9]{32}$/.test(p.trial_id) && ['retain_terminal_unclassified_cancellation','retain_terminal_agent_failure'].includes(p.decision)
      && p.normal_completion===false && p.valid_failure_coverage===true && p.retry_required===false
      && p.cause==='UNKNOWN' && p.caller==='UNKNOWN' && ['Mac','Linux','UNKNOWN'].includes(p.device), 'Invalid public terminal decision');
    assert(Array.isArray(p.notes) && p.notes.every(n=>noteCodes.includes(n)), 'Unsafe review notes');
    keys(p.source_sha256,['manifest','result','scoring']);
    assert(['manifest','result','scoring'].every(k=>hash(p.source_sha256[k])), 'Missing scientific source hash');
  }
  return doc;
}
