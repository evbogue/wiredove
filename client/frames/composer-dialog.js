// Frame-owned placement, focus and viewport behavior; no identity/storage imports.
export function createComposerDialog(surface, { onClose, onOpen, onDispose, root = document.body, scroll: scrollAdapter } = {}) {
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
  const previousFocus = root.activeElement || document.activeElement;
  const scroll = { x: window.scrollX, y: scrollAdapter?.get() ?? window.scrollY };
  let opened = false;
  let cleanup;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanup?.();
    observer.disconnect();
    onDispose?.();
  };
  const close = () => onClose?.();
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
      .filter(node => !node.closest('[hidden]') && node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && ((root.activeElement || document.activeElement) === first || (root.activeElement || document.activeElement) === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (root.activeElement || document.activeElement) === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  const observer = new MutationObserver(() => {
    if (overlay.isConnected && !opened) {
      opened = true;
      const bodyStyle = root.style?.cssText;
      if (root === document.body) {
        root.style.position = 'fixed';
        root.style.top = `-${scroll.y}px`;
        root.style.left = `-${scroll.x}px`;
        root.style.width = '100%';
      }
      const siblings = [...root.children].filter(node => node !== overlay);
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
      root.addEventListener('keydown', keydown);
      cleanup = () => {
        viewport?.removeEventListener('resize', resize);
        viewport?.removeEventListener('scroll', resize);
        window.removeEventListener('resize', resize);
        root.removeEventListener('keydown', keydown);
        inert.forEach(([node, value]) => { node.inert = value; });
        if (root.style) root.style.cssText = bodyStyle;
        if (scrollAdapter) scrollAdapter.to({ top: scroll.y });
        else window.scrollTo(scroll.x, scroll.y);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      };
      onOpen?.();
    } else if (opened && !overlay.isConnected) { dispose(); }
  });
  observer.observe(root, { childList: true });
  overlay.dispose = dispose;
  return overlay;
}
