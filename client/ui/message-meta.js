// Shared right-metadata cluster: pubkey, QR toggle, permalink, raw toggle, timestamp.
// Frames supply the nodes they own (e.g. the website's live timestamp link);
// the cluster owns the order, separators and classes. Controls are optional:
// a frame omits the QR toggle when it has no QRious loader, and the raw toggle
// when the record has nothing to show.
export function createMessageMeta({
  post = {}, controls = {}, document: doc = globalThis.document,
} = {}) {
  const meta = doc.createElement('span');
  meta.className = 'message-meta';
  const pubkey = doc.createElement('span');
  pubkey.className = 'pubkey';
  pubkey.textContent = String(post.author || '').substring(0, 6);
  meta.append(pubkey, ' ');
  if (controls.qr) meta.append(controls.qr, ' ');
  const permalink = doc.createElement('a');
  permalink.className = 'material-symbols-outlined';
  permalink.href = controls.permalinkHref || '#' + (post.signature || post.id || '');
  permalink.textContent = 'Share';
  meta.append(permalink, ' ');
  if (controls.rawToggle) meta.append(controls.rawToggle, ' ');
  if (controls.timestamp) meta.append(controls.timestamp);
  return meta;
}
