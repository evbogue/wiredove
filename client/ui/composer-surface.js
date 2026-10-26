// UI only: frames supply identity, attachments, drafts and publication.
export function iconButton(label, icon, onClick) {
  // Font faces live in the document so icons also work inside embed shadow roots.
  if (!document.querySelector('link[href*="family=Material+Symbols"]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&family=Source+Sans+3';
    document.head.append(font);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'composer-icon';
  button.title = label;
  button.setAttribute('aria-label', label);
  const glyph = document.createElement('span');
  glyph.className = 'material-symbols-outlined';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  button.append(glyph);
  button.addEventListener('click', onClick);
  return button;
}

export function createComposerSurface({ textarea, identity, context, onPreview, onPublish, onClose, publishLabel = 'Publish' } = {}) {
  const root = document.createElement('section');
  root.className = 'composer-surface';
  const header = document.createElement('header');
  header.className = 'composer-top';
  const heading = document.createElement('div');
  heading.className = 'composer-identity';
  if (identity) heading.append(identity);
  header.append(heading);
  if (onClose) header.append(iconButton('Close composer (draft saved)', 'close', onClose));
  const body = document.createElement('div');
  body.className = 'composer-scroll';
  if (context) { context.classList.add('composer-context'); body.append(context); }
  textarea ||= document.createElement('textarea');
  textarea.classList.add('composer-text');
  textarea.setAttribute('aria-label', textarea.placeholder || 'Write a message');
  const preview = document.createElement('div');
  preview.className = 'composer-preview';
  preview.hidden = true;
  const attachments = document.createElement('div');
  attachments.className = 'composer-attachments';
  body.append(textarea, preview, attachments);
  const footer = document.createElement('footer');
  footer.className = 'composer-footer';
  const tools = document.createElement('div');
  tools.className = 'composer-tools';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Attachments');
  const actions = document.createElement('div');
  actions.className = 'composer-submit-actions';
  const previewButton = document.createElement('button');
  previewButton.type = 'button';
  previewButton.textContent = 'Preview';
  let previewing = false;
  previewButton.addEventListener('click', async () => {
    previewing = !previewing;
    textarea.hidden = previewing;
    preview.hidden = !previewing;
    previewButton.textContent = previewing ? 'Back to editing' : 'Preview';
    previewButton.setAttribute('aria-pressed', String(previewing));
    if (previewing) {
      try { await onPreview?.(preview); }
      catch (error) { status.textContent = error.message || 'Could not preview this draft'; }
    }
    else textarea.focus();
  });
  const publish = document.createElement('button');
  publish.type = 'button';
  publish.className = 'composer-publish';
  publish.textContent = publishLabel;
  publish.addEventListener('click', event => onPublish?.(event));
  actions.append(previewButton, publish);
  footer.append(tools, actions);
  const status = document.createElement('div');
  status.className = 'composer-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(header, body, status, footer);
  root.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !publish.disabled) {
      event.preventDefault(); publish.click();
    }
  });
  return { root, header, body, textarea, preview, attachments, tools, publish, status };
}
