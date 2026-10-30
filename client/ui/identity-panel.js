// Reusable identity/setup UI; the injected session owns keys and persistence.
export function createIdentityPanel(session, { onChange, onRetry } = {}) {
  const root = document.createElement('section');
  root.className = 'identity-panel';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  let busy = false, generation = 0;
  const button = (label, action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.onclick = async () => {
      if (busy) return;
      status.textContent = '';
      busy = true; root.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try { await action(); await render(); await onChange?.(); }
      catch (error) { status.textContent = error.message || 'Identity storage is unavailable.'; }
      finally { busy = false; root.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
    };
    return node;
  };
  async function render() {
    const token = ++generation;
    const pending = await session.pending();
    if (token !== generation) return;
    root.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Your Wiredove identity';
    const description = document.createElement('p');
    description.textContent = 'Wiredove.net and this website have separate browser storage. Import your backup to use the same identity. Keys stay in this browser.';
    root.append(heading, description);
    const identity = session.identity();
    if (identity) {
      const summary = document.createElement('p'); summary.textContent = identity.name || 'Identity ready';
      const details = document.createElement('details');
      const title = document.createElement('summary'); title.textContent = 'Public identity';
      const key = document.createElement('code'); key.textContent = identity.author;
      details.append(title, key);
      root.append(summary, details, button('Download identity backup', () => {
        const url = URL.createObjectURL(new Blob([session.export()], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'wiredove-identity.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
    } else {
      const label = document.createElement('label'); label.textContent = 'Display name ';
      const name = document.createElement('input'); name.maxLength = 100; name.autocomplete = 'nickname'; label.append(name);
      root.append(label, button('Create identity', () => session.create(name.value)));
    }
    const importLabel = document.createElement('label'); importLabel.textContent = 'Import Wiredove identity backup ';
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,.txt,application/json,text/plain';
    file.addEventListener('change', async () => {
      const selected = file.files?.[0]; if (!selected || busy) return;
      busy = true;
      try {
        if (selected.size > 16384) throw new Error('Identity backup is too large.');
        await session.import(await selected.text()); await render(); await onChange?.();
      } catch (error) { status.textContent = error.message || 'Could not import identity.'; }
      finally { busy = false; file.value = ''; }
    });
    importLabel.append(file); root.append(importLabel);
    if (pending.length) {
      const note = document.createElement('p'); note.textContent = 'A signed publication is awaiting storage or relay confirmation. Retry sends the exact original bytes.';
      root.append(note, button('Retry pending publication', async () => {
        const results = await session.retry();
        await onRetry?.(results);
        status.textContent = (await session.pending()).length ? 'Saved here; relay confirmation is still pending.' : 'Publication confirmed by Wiredove.';
      }));
    }
    root.append(status);
  }
  root.refresh = render;
  void render().catch(error => { status.textContent = error.message; root.append(status); });
  return root;
}
