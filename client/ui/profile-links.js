import { normalizeProfileLinks, profileLinkService } from '../profile-links.js';
import { brandPaths } from '../../vendor/simple-icons/paths.js';

export function createProfileLinkIcon(url) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('profile-link-icon');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  const brand = brandPaths[profileLinkService(url)];
  if (brand) {
    path.setAttribute('d', brand);
    path.setAttribute('fill', 'currentColor');
  } else {
    path.setAttribute('d', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
  }
  svg.append(path);
  return svg;
}

export function renderProfileLinks(container, links) {
  container.replaceChildren();
  container.classList.add('profile-links');
  container.setAttribute('aria-label', 'Profile links');
  for (const link of normalizeProfileLinks(links)) {
    const anchor = document.createElement('a');
    anchor.className = 'profile-link';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer me';
    anchor.title = link.url;
    const label = document.createElement('span');
    label.textContent = link.label;
    anchor.append(createProfileLinkIcon(link.url), label);
    container.append(anchor);
  }
}

export function createProfileLinksEditor() {
  const element = document.createElement('fieldset');
  element.className = 'profile-links-editor profile-edit-only';
  const legend = document.createElement('legend');
  legend.textContent = 'Links';
  const hint = document.createElement('p');
  hint.textContent = 'Add your website, projects, and social profiles. Use full URLs starting with https:// or http://.';
  const rows = document.createElement('div');
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Add link';
  let drafts = [];
  const draw = () => {
    rows.replaceChildren();
    drafts.forEach((draft, index) => {
      const row = document.createElement('div');
      row.className = 'profile-link-row';
      const icon = createProfileLinkIcon(draft.url);
      const label = document.createElement('input');
      label.setAttribute('aria-label', `Link ${index + 1} label`);
      label.placeholder = 'Label (optional)';
      label.value = draft.label;
      label.oninput = () => { draft.label = label.value; };
      const url = document.createElement('input');
      url.type = 'url';
      url.setAttribute('aria-label', `Link ${index + 1} URL`);
      url.placeholder = 'https://example.com';
      url.value = draft.url;
      url.oninput = () => { draft.url = url.value; icon.replaceChildren(...createProfileLinkIcon(draft.url).childNodes); };
      const labelField = document.createElement('label');
      labelField.className = 'profile-field';
      labelField.append('Label (optional)', label);
      const urlField = document.createElement('label');
      urlField.className = 'profile-field';
      urlField.append('URL', url);
      const controls = document.createElement('div');
      controls.className = 'profile-link-controls';
      row.append(icon, labelField, urlField, controls);
      const control = (text, action, disabled = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-label', `${text} link ${index + 1}`);
        button.disabled = disabled;
        button.onclick = () => { action(); draw(); };
        controls.append(button);
      };
      if (drafts.length > 1) control('Move up', () => { [drafts[index - 1], drafts[index]] = [drafts[index], drafts[index - 1]]; }, index === 0);
      if (drafts.length > 1) control('Move down', () => { [drafts[index + 1], drafts[index]] = [drafts[index], drafts[index + 1]]; }, index === drafts.length - 1);
      control('Remove', () => drafts.splice(index, 1));
      rows.append(row);
    });
  };
  add.onclick = () => { drafts.push({ label: '', url: '' }); draw(); rows.lastElementChild?.querySelector('input')?.focus(); };
  element.append(legend, hint, rows, add);
  return {
    element,
    setLinks(links) { drafts = normalizeProfileLinks(links).map(link => ({ ...link })); draw(); },
    getLinks() { return normalizeProfileLinks(drafts, { strict: true }); },
    set disabled(value) { for (const control of element.querySelectorAll('input, button')) control.disabled = value; if (!value) draw(); },
  };
}
