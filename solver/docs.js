// Adds a copy button to each code block. The button sits inside the block's own box,
// so adding it moves nothing on the page.
for (const block of document.querySelectorAll('.code-block')) {
  const pre = block.querySelector('pre');
  if (!pre || !navigator.clipboard) continue;
  const button = document.createElement('button');
  button.className = 'copy-code';
  button.type = 'button';
  button.title = 'Copy code';
  button.setAttribute('aria-label', `Copy ${pre.getAttribute('aria-label') || 'code'}`);
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const status = document.createElement('span');
  status.className = 'copy-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  block.append(status, button);
  let timer;
  button.addEventListener('click', async () => {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(pre.textContent);
      status.textContent = 'Copied';
    } catch {
      status.textContent = 'Clipboard unavailable';
    }
    status.hidden = false;
    timer = setTimeout(() => { status.hidden = true; status.textContent = ''; }, 2500);
  });
}
