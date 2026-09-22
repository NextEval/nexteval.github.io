(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const switchers = [...header.querySelectorAll('.nav-switcher')];
  const context = header.querySelector('.context-switcher');
  const closeOthers = (current) => switchers.forEach(item => {
    if (item !== current) item.open = false;
  });
  switchers.forEach(item => {
    const summary = item.querySelector('summary');
    item.addEventListener('toggle', () => { if (item.open) closeOthers(item); });
    summary.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      item.open = true;
      closeOthers(item);
      const links = item.querySelectorAll('nav a');
      (event.key === 'ArrowDown' ? links[0] : links[links.length - 1])?.focus();
    });
    item.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => {
      item.open = false;
      if (link.hash && new URL(link.href).pathname === location.pathname) summary.focus();
    }));
  });
  document.addEventListener('click', event => {
    switchers.forEach(item => { if (!item.contains(event.target)) item.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = switchers.find(item => item.open);
    if (!open) return;
    event.preventDefault();
    open.open = false;
    open.querySelector('summary').focus();
  });
  document.addEventListener('focusin', event => {
    switchers.forEach(item => { if (!item.contains(event.target)) item.open = false; });
  });
  if (context) {
    const refresh = () => {
      const selected = context.querySelector('[aria-current="page"]');
      if (selected) context.querySelector('[data-current-view]').textContent = selected.textContent.trim();
    };
    // Bench updates its active link as hash routes change, including back/forward.
    new MutationObserver(refresh).observe(context.querySelector('nav'), {
      subtree: true, attributes: true, attributeFilter: ['aria-current'],
    });
    refresh();
  }
  window.lucide?.createIcons();
})();
