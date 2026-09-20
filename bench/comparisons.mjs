// Comparison membership is distinct from chart visibility. No scoring runs here.
export function participantOrder(scope) {
  // Keep the requested GPT legend order without changing stored column IDs.
  return scope.id === 'gpt' ? [2, 1, 0, 3, 4, 6, 5] : scope.participants.map((_, i) => i);
}

export function selectionMask(indices, count) {
  if (!Array.isArray(indices) || count < 2 || count > 20 ||
      indices.some(i => !Number.isInteger(i) || i < 0 || i >= count) ||
      new Set(indices).size !== indices.length) throw new Error('Invalid solver selection');
  if (indices.length < 2) throw new Error('Select at least two solvers');
  return indices.reduce((mask, i) => mask | (1 << i), 0);
}

export function subsetPath(scope, mask) {
  if (!scope.subsets[String(mask)]) throw new Error('Comparison is not available');
  return `assets/comparisons/${scope.id}/${mask}.json.gz`;
}

export function validateComparison(data, scope, mask) {
  const indices = scope.participants.map((_, i) => i).filter(i => mask & (1 << i));
  if (data.schema !== 1 || data.scope !== scope.id || data.problems !== scope.problems ||
      data.repeats !== scope.repeats || data.new_evaluations !== 0 ||
      JSON.stringify(data.indices) !== JSON.stringify(indices) ||
      data.scores.length !== indices.length || data.scores.some(x => !Number.isFinite(x))) {
    throw new Error('Comparison identity mismatch');
  }
  for (const kind of ['performance', 'data']) {
    const series = data.profiles[kind].series;
    if (series.length !== indices.length || series.some((s, i) =>
      s.label !== scope.participants[indices[i]].label || s.x.length !== s.y.length)) {
      throw new Error('Comparison curve mismatch');
    }
  }
  return data;
}

export async function loadComparison(scope, mask) {
  const response = await fetch(subsetPath(scope, mask));
  if (!response.ok) throw new Error(`Comparison download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== scope.subsets[String(mask)].sha256) throw new Error('Comparison integrity check failed');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return validateComparison(await new Response(stream).json(), scope, mask);
}
