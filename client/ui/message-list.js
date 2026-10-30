import { applyWiredoveStyles } from './styles.js';

// Keep unchanged message instances mounted so refresh does not reset playback,
// focus or an image viewer. The host still owns record verification and ordering.
export function updateMessageList(host, rows) {
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  if (!host._list) {
    applyWiredoveStyles(root);
    host._list = document.createElement('div');
    root.append(host._list);
    host._messages = new Map();
  }
  const wanted = new Set();
  const occurrences = new Map();
  let previous = null;
  for (const [index, { post, reply = false }] of rows.entries()) {
    const id = post.id || `position-${index}`;
    const occurrence = occurrences.get(id) || 0;
    occurrences.set(id, occurrence + 1);
    const key = `${id}:${occurrence}`;
    wanted.add(key);
    let entry = host._messages.get(key);
    if (!entry) {
      const message = document.createElement('wiredove-message');
      const wrapper = document.createElement('div');
      wrapper.append(message);
      entry = { message, wrapper };
      host._messages.set(key, entry);
    }
    const { message, wrapper } = entry;
    wrapper.className = reply ? 'reply' : '';
    message.onReply = typeof host._onReply === 'function' ? value => {
      host._onReply(value);
      // Compatibility intent event; it is not another publication request.
      host.dispatchEvent(new CustomEvent('wiredove-reply', { detail: value, bubbles: true }));
    } : null;
    message.onNavigate = typeof host._onNavigate === 'function' ? route => host._onNavigate(route) : null;
    message.presentation = host._presentation;
    message.post = post;
    const next = previous ? previous.nextSibling : host._list.firstChild;
    if (next !== wrapper) {
      if (wrapper.parentNode === host._list && host._list.moveBefore) host._list.moveBefore(wrapper, next);
      else host._list.insertBefore(wrapper, next);
    }
    previous = wrapper;
  }
  for (const [key, entry] of host._messages) {
    if (!wanted.has(key)) { entry.wrapper.remove(); host._messages.delete(key); }
  }
}
