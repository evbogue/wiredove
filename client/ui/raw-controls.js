// Shared raw-data toggle: one implementation for the website and embeds.
// Shows the verified record fields (id, signature, opened envelope, content),
// lazily building the <pre> on first open and removing it on close.
// The opened envelope is optional; frames that do not track it omit it.
export function createRawControls({
  id, signature, opened, content, document: doc = globalThis.document,
} = {}) {
  const rawDiv = doc.createElement('div');
  rawDiv.className = 'message-raw';
  const toggle = doc.createElement('a');
  toggle.className = 'material-symbols-outlined';
  toggle.textContent = 'Code';
  let shown = false;
  let pre = null;
  toggle.addEventListener('click', () => {
    if (!shown) {
      if (!pre) {
        pre = doc.createElement('pre');
        pre.className = 'hljs';
        pre.textContent = [id, signature, opened, content]
          .filter(part => part != null && part !== '')
          .join('\n\n');
      }
      rawDiv.append(pre);
      shown = true;
    } else {
      pre?.remove();
      shown = false;
    }
  });
  return { toggle, rawDiv };
}
