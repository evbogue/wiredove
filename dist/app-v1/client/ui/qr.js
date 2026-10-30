// Shared QR toggle and its render target.
// The target element is passed by ref; there are no document ID lookups.
// QRious loading is injected so each host controls its vendor chunk.
export function createQRTarget({ document: doc = globalThis.document } = {}) {
  const target = doc.createElement('div');
  target.className = 'qr-target';
  target.style.cssText =
    'margin: 8px auto 0 auto; text-align: center; width: min(90vw, 400px); max-width: 400px;';
  return target;
}

export function createQRControl({
  blob, destination, target, loadQRious, document: doc = globalThis.document,
} = {}) {
  const link = doc.createElement('a');
  link.className = 'material-symbols-outlined';
  link.textContent = 'Qr_Code';
  link.addEventListener('click', async () => {
    if (!target) return;
    if (!target.firstChild) {
      const canvas = doc.createElement('canvas');
      target.append(canvas);
      const view = doc.defaultView || (typeof window !== 'undefined' ? window : undefined);
      const darkMode = !!(view && view.matchMedia &&
        view.matchMedia('(prefers-color-scheme: dark)').matches);
      const background = darkMode ? '#222' : '#f8f8f8';
      const foreground = darkMode ? '#ccc' : '#444';
      const innerWidth = view && view.innerWidth ? view.innerWidth : 0;
      const innerHeight = view && view.innerHeight ? view.innerHeight : 0;
      const size = Math.max(160, Math.min(
        400,
        Math.floor(innerWidth * 0.9),
        Math.floor(innerHeight * 0.6),
      ));
      try {
        const QRious = await loadQRious();
        const href = destination || (view && view.location ? view.location.href : '') + (blob || '');
        new QRious({ element: canvas, value: href, size, background, foreground });
      } catch (err) {
        console.warn('QRious load failed', err);
        target.replaceChildren();
      }
    } else {
      target.replaceChildren();
    }
  });
  return link;
}
