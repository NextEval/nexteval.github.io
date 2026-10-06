export function icon(name) {
  if (name === 'perturbed-start') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-icon="perturbed-start">
      <circle cx="5" cy="19" r="3" />
      <path d="M8 16 14 10M10 10h4v4" />
      <circle cx="19" cy="5" r="2.5" fill="currentColor" />
    </svg>`;
  }
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}
