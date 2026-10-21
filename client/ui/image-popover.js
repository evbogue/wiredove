import { resolveImageSource, safeLinkURL } from './image-source.js';

const viewers = new WeakMap();
const styleURL = new URL('./image-gallery.css', import.meta.url).href;

// One lazily mounted native dialog per document, including iframe documents.
export function createImagePopover({ document: doc = globalThis.document, getImage, requestImage, delegateRoot } = {}) {
  if (viewers.has(doc)) return viewers.get(doc);
  if (!doc.querySelector('link[data-wiredove-gallery]')) {
    const style = doc.createElement('link');
    style.rel = 'stylesheet'; style.href = styleURL;
    style.dataset.wiredoveGallery = '';
    doc.head.append(style);
  }
  const dialog = doc.createElement('dialog');
  dialog.className = 'image-popover';
  dialog.setAttribute('aria-label', 'Image viewer');
  const make = (tag, className, text) => {
    const node = doc.createElement(tag); node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const controls = make('div', 'image-popover-controls');
  const button = (text, label) => { const b = make('button', '', text); b.type = 'button'; b.setAttribute('aria-label', label); return b; };
  const close = button('×', 'Close image');
  const previous = button('←', 'Previous image');
  const next = button('→', 'Next image');
  const counter = make('span', 'image-popover-counter');
  counter.setAttribute('aria-live', 'polite'); counter.setAttribute('aria-atomic', 'true');
  controls.append(previous, counter, next, close);
  const stage = make('div', 'image-popover-stage');
  const image = make('img', 'image-popover-image');
  image.draggable = false;
  const status = make('div', 'image-popover-status'); status.setAttribute('role', 'status');
  const retry = button('Retry', 'Retry image'); retry.hidden = true;
  stage.append(image, status, retry);
  const footer = make('div', 'image-popover-footer');
  const caption = make('span', 'image-popover-caption');
  const original = make('a', '', 'Original link');
  original.target = '_blank'; original.rel = 'noopener noreferrer';
  const download = make('a', '', 'Open original');
  download.target = '_blank'; download.rel = 'noopener noreferrer';
  footer.append(caption, original, download);
  dialog.append(controls, stage, footer);
  let active, controller, sequence = 0, gesture, suppressClick = false;
  const clear = () => {
    sequence++; controller?.abort();
    image.removeAttribute('src'); download.removeAttribute('href'); original.removeAttribute('href');
    const previousActive = active; active = null;
    if (previousActive?.trigger?.isConnected) previousActive.trigger.focus({ preventScroll: true });
    else if (previousActive?.owner?.isConnected) previousActive.owner.querySelector('button')?.focus({ preventScroll: true });
  };
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  const closeViewer = () => { if (dialog.open) { dialog.close(); clear(); } };
  close.onclick = closeViewer;
  const show = async () => {
    if (!active) return;
    const request = active;
    const item = request.images[request.index];
    const current = ++sequence;
    controller?.abort(); controller = new AbortController();
    image.removeAttribute('src'); image.alt = item.alt || 'Post image';
    status.textContent = 'Loading image…'; retry.hidden = true;
    download.hidden = true;
    previous.disabled = request.index === 0;
    next.disabled = request.index === request.images.length - 1;
    counter.textContent = `${request.index + 1} of ${request.images.length}`;
    caption.textContent = item.title || '';
    const href = safeLinkURL(item.link);
    original.hidden = !href;
    if (href) original.href = href;
    try {
      const src = await resolveImageSource(item, request.resolveImage, controller.signal);
      if (current !== sequence || !active) return;
      if (!src) throw Error('Unavailable');
      image.src = src; download.href = src; download.hidden = false;
    } catch {
      if (current !== sequence || !active) return;
      status.textContent = 'Image unavailable'; retry.hidden = false;
    }
  };
  image.onload = () => { if (active) { status.textContent = ''; retry.hidden = true; } };
  image.onerror = () => { if (active) { status.textContent = 'Image unavailable'; retry.hidden = false; } };
  retry.onclick = show;
  const move = delta => {
    if (!active) return;
    const index = active.index + delta;
    if (index < 0 || index >= active.images.length) return;
    active.index = index; void show();
  };
  previous.onclick = () => move(-1); next.onclick = () => move(1);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1);
    }
    // Native dialog provides Escape and modal focus containment.
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button, a[href]')].filter(el => !el.disabled && !el.hidden);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  dialog.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; return; }
    if (event.target === dialog || event.target === image || event.target === stage) closeViewer();
  });
  stage.addEventListener('pointerdown', event => {
    if (event.target !== image && event.target !== stage) return;
    suppressClick = false;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  stage.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) suppressClick = true;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) move(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { gesture = null; suppressClick = true; });
  dialog.openGallery = request => {
    closeViewer();
    active = { ...request };
    // Ignore queued close events while a new viewer session is open.
    if (!dialog.isConnected) doc.body.append(dialog);
    dialog.showModal(); close.focus(); void show();
    return () => { if (active?.owner === request.owner) closeViewer(); };
  };
  // Kept for legacy profile photos; galleries use explicit actions from shadow roots.
  if (delegateRoot) {
    const openLegacy = event => {
      const target = event.target.closest?.('img.post-image');
      if (!target) return;
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      dialog.openGallery({ images: [{ src: target.dataset.hash || target.src, alt: target.alt }],
        index: 0, trigger: target, owner: target,
        resolveImage: async hash => { const src = await getImage?.(hash); if (!src) await requestImage?.(hash); return src; } });
    };
    delegateRoot.addEventListener('click', openLegacy);
    delegateRoot.addEventListener('keydown', openLegacy);
  }
  viewers.set(doc, dialog);
  return dialog;
}

export function openImageGallery(request) {
  const doc = request.owner?.ownerDocument || globalThis.document;
  return createImagePopover({ document: doc }).openGallery(request);
}
