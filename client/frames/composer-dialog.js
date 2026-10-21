// Frame-owned placement, focus and viewport behavior; no identity/storage imports.
export function createComposerDialog(surface, { onClose, onOpen, onDispose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay composer-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'message composer-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Compose message');
  dialog.tabIndex = -1;
  dialog.append(surface);
  overlay.append(dialog);
  const previousFocus = document.activeElement;
  const scroll = { x: window.scrollX, y: window.scrollY };
  let opened = false;
  let cleanup;
  const close = () => onClose?.();
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
      .filter(node => !node.closest('[hidden]') && node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  const observer = new MutationObserver(() => {
    if (overlay.isConnected && !opened) {
      opened = true;
      const bodyStyle = document.body.style.cssText;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scroll.y}px`;
      document.body.style.left = `-${scroll.x}px`;
      document.body.style.width = '100%';
      const siblings = [...document.body.children].filter(node => node !== overlay);
      const inert = siblings.map(node => [node, node.inert]);
      siblings.forEach(node => { node.inert = true; });
      const viewport = window.visualViewport;
      const resize = () => {
        overlay.style.height = `${viewport?.height || window.innerHeight}px`;
        overlay.style.top = `${viewport?.offsetTop || 0}px`;
      };
      resize();
      viewport?.addEventListener('resize', resize);
      viewport?.addEventListener('scroll', resize);
      window.addEventListener('resize', resize);
      document.addEventListener('keydown', keydown);
      cleanup = () => {
        viewport?.removeEventListener('resize', resize);
        viewport?.removeEventListener('scroll', resize);
        window.removeEventListener('resize', resize);
        document.removeEventListener('keydown', keydown);
        inert.forEach(([node, value]) => { node.inert = value; });
        document.body.style.cssText = bodyStyle;
        window.scrollTo(scroll.x, scroll.y);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      };
      onOpen?.();
    } else if (opened && !overlay.isConnected) { cleanup?.(); onDispose?.(); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true });
  return overlay;
}
