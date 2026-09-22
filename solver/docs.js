document.querySelectorAll('pre').forEach((pre, index) => {
  const button = document.createElement('button');
  button.className = 'copy-code';
  button.type = 'button';
  button.title = 'Copy code';
  button.setAttribute('aria-label', `Copy ${pre.getAttribute('aria-label') || `code block ${index + 1}`}`);
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', 'copy');
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  const status = document.createElement('span');
  status.className = 'copy-status';
  status.setAttribute('role', 'status');
  const tools = document.createElement('div');
  tools.className = 'code-tools';
  tools.append(status, button);
  pre.before(tools);
  let timer;
  button.addEventListener('click', async () => {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(pre.textContent);
      status.textContent = 'Copied';
    } catch {
      status.textContent = 'Clipboard unavailable';
    }
    timer = setTimeout(() => { status.textContent = ''; }, 2500);
  });
});
window.lucide?.createIcons();
