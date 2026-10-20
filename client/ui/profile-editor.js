import { createProfileLinksEditor } from './profile-links.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

// UI only: the consuming frame owns identity, storage and publication.
export function createProfileEditor({ name = '', bio = '', links = [], imageSrc = '', onImageChange }) {
  const fields = el('div', 'profile-fields profile-edit-only');
  const field = (title, control) => {
    const label = el('label', 'profile-field');
    label.append(el('span', '', title), control);
    fields.append(label);
    return control;
  };
  const nameInput = field('Display name', el('input'));
  nameInput.value = name;
  nameInput.required = true;
  nameInput.maxLength = 100;
  nameInput.autocomplete = 'nickname';
  const bioInput = field('Bio (optional)', el('textarea'));
  bioInput.rows = 4;
  bioInput.placeholder = 'Tell people a little about yourself';
  bioInput.value = bio;
  const linksEditor = createProfileLinksEditor();
  linksEditor.setLinks(links);
  fields.append(linksEditor.element);
  const photo = el('div', 'profile-photo-editor profile-edit-only');
  const image = el('img', 'profile-avatar');
  image.src = imageSrc;
  image.alt = 'Profile photo preview';
  const choose = el('button', '', 'Change photo');
  choose.type = 'button';
  const upload = el('input');
  upload.type = 'file';
  upload.accept = 'image/*';
  upload.hidden = true;
  const photoStatus = el('p', 'profile-help');
  photoStatus.setAttribute('role', 'status');
  photo.append(image, choose, upload, photoStatus);
  choose.onclick = () => upload.click();
  upload.onchange = async () => {
    const file = upload.files?.[0];
    if (!file) return;
    upload.value = '';
    const url = URL.createObjectURL(file);
    const source = new Image();
    try {
      source.src = url;
      await source.decode();
      const dialog = el('dialog', 'identity-dialog photo-crop-dialog');
      const heading = el('h2', '', 'Frame your photo');
      heading.id = 'photo-crop-title';
      dialog.setAttribute('aria-labelledby', heading.id);
      const canvas = el('canvas', 'photo-crop-preview');
      canvas.width = canvas.height = 256;
      const sliders = {};
      const draw = () => {
        const side = Math.min(source.width, source.height) / Number(sliders.Zoom.value);
        const x = (source.width - side) * Number(sliders.Horizontal.value) / 100;
        const y = (source.height - side) * Number(sliders.Vertical.value) / 100;
        canvas.getContext('2d').drawImage(source, x, y, side, side, 0, 0, 256, 256);
      };
      dialog.append(heading, el('p', 'profile-help', 'Adjust the crop, then use this photo.'), canvas);
      for (const [title, min, max, step, value] of [['Zoom', 1, 3, .05, 1], ['Horizontal', 0, 100, 1, 50], ['Vertical', 0, 100, 1, 50]]) {
        const label = el('label', 'profile-field', title);
        const slider = el('input');
        Object.assign(slider, { type: 'range', min, max, step, value });
        sliders[title] = slider;
        slider.oninput = draw;
        label.append(slider);
        dialog.append(label);
      }
      const actions = el('div', 'profile-actions');
      const apply = el('button', 'primary-action', 'Use photo');
      const cancel = el('button', '', 'Cancel crop');
      apply.type = cancel.type = 'button';
      actions.append(apply, cancel);
      dialog.append(actions);
      document.body.append(dialog);
      dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); }, { once: true });
      cancel.onclick = () => dialog.close();
      apply.onclick = async () => {
        apply.disabled = cancel.disabled = true;
        try {
          const data = canvas.toDataURL('image/png');
          await onImageChange(data);
          image.src = data;
          photoStatus.textContent = 'Photo ready. Save changes to publish it.';
          dialog.close();
        } catch {
          photoStatus.textContent = 'Could not prepare this photo. Try another image.';
          dialog.close();
        }
      };
      draw();
      dialog.showModal();
    } catch {
      URL.revokeObjectURL(url);
      photoStatus.textContent = 'Could not open this image. Try a different file.';
    }
  };
  return {
    fields, photo, image, nameInput, bioInput, linksEditor,
    reset({ name, bio, links, imageSrc }) {
      nameInput.value = name;
      bioInput.value = bio;
      linksEditor.setLinks(links);
      image.src = imageSrc;
      photoStatus.textContent = '';
    },
    set disabled(value) {
      nameInput.disabled = bioInput.disabled = choose.disabled = value;
      linksEditor.disabled = value;
    }
  };
}
