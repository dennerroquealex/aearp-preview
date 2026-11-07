(() => {
  const key = 'aearp-link-feedback';
  const toast = document.createElement('div');
  toast.className = 'toast link-feedback';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  let timer;
  const show = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('show'), 3200);
  };

  const pending = sessionStorage.getItem(key);
  if (pending) {
    sessionStorage.removeItem(key);
    show(`Página aberta: ${pending}`);
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    const label = (link.getAttribute('aria-label') || link.textContent || link.href).trim().replace(/\s+/g, ' ');
    const destination = new URL(link.href, location.href);
    if (link.hasAttribute('download')) {
      show('Download iniciado.');
    } else if (destination.protocol === 'mailto:') {
      show('Abrindo seu aplicativo de e-mail.');
    } else if (link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || destination.origin !== location.origin) {
      show('Link aberto em uma nova aba.');
    } else if (destination.pathname === location.pathname && destination.hash) {
      show(`Seção aberta: ${label}`);
    } else if (destination.pathname !== location.pathname || destination.search !== location.search) {
      sessionStorage.setItem(key, label);
    } else {
      show('Você já está nesta página.');
    }
  });
})();
