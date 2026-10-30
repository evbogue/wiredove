import { createProfileLinksEditor } from './profile-links.js';
import { createPhotoCropper } from './photo-cropper.js';
import { readImageFile } from './image-source.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

// UI only: the consuming frame owns identity, storage and publication.
export function createProfileEditor({ name = '', bio = '', links = [], imageSrc = '', photoState = null, onImageChange, onBusy }) {
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
  upload.accept = 'image/png,image/jpeg,image/gif,image/webp';
  upload.hidden = true;
  const photoStatus = el('p', 'profile-help');
  photoStatus.setAttribute('role', 'status');
  photo.append(image, choose, upload, photoStatus);
  const adjust = el('button', '', 'Adjust crop'); adjust.type = 'button';
  photo.insertBefore(adjust, upload);
  let originalFile = null, state = photoState;
  const updateAdjust = () => { adjust.hidden = !originalFile && !state?.original; };
  updateAdjust();
  choose.onclick = () => upload.click();
  const openCrop = async (file, settings = null) => {
    if (!file || file.size > 32 * 1024 * 1024) { photoStatus.textContent = 'Choose an image up to 32 MiB.'; return; }
    const url = URL.createObjectURL(file), source = new Image();
    let controller, dialog, closed = false;
    try {
      source.src = url; await source.decode();
      dialog = el('dialog', 'identity-dialog photo-crop-dialog');
      const heading = el('h2', '', 'Frame your photo');
      heading.id = 'photo-crop-' + crypto.randomUUID(); dialog.setAttribute('aria-labelledby', heading.id);
      const stage = el('div', 'photo-crop-stage'); stage.tabIndex = 0;
      stage.setAttribute('role', 'group');
      stage.setAttribute('aria-label', 'Photo framing. Drag to move; use arrow keys to adjust.');
      const preview = el('canvas', 'photo-crop-preview'); preview.width = preview.height = 192;
      preview.setAttribute('aria-label', 'Circular profile photo preview');
      const size = el('p', 'profile-help'); size.setAttribute('role', 'status');
      const zoom = el('input'); Object.assign(zoom, { type: 'range', min: 1, max: 6, step: .01, value: 1 });
      const angle = el('input'); Object.assign(angle, { type: 'range', min: -180, max: 180, step: .1, value: 0 });
      const controls = el('div', 'photo-crop-controls');
      const angleValue = el('output'); angleValue.setAttribute('aria-hidden', 'true');
      for (const [title, input] of [['Zoom', zoom], ['Angle', angle]]) {
        const label = el('label', 'profile-field', title); input.setAttribute('aria-label', title); label.append(input); if (title === 'Angle') label.append(angleValue); controls.append(label);
      }
      const turns = el('div', 'profile-actions');
      for (const [title, run] of [['Rotate left 90°', () => controller.rotate(-90)], ['Rotate right 90°', () => controller.rotate(90)], ['Reset crop', () => controller.reset()]]) {
        const button = el('button', '', title); button.type = 'button'; button.onclick = run; turns.append(button);
      }
      const actions = el('div', 'profile-actions photo-crop-confirm');
      const apply = el('button', 'primary-action', 'Use photo'), cancel = el('button', '', 'Cancel crop');
      apply.type = cancel.type = 'button'; apply.disabled = true; actions.append(apply, cancel);
      const cropStatus = el('p', 'profile-help'); cropStatus.setAttribute('role', 'status');
      dialog.append(heading, el('p', 'profile-help', 'Drag or pinch to frame your photo. Adjust the angle to straighten it.'), stage, preview, controls, turns, size, actions, cropStatus);
      let applying = false;
      dialog.addEventListener('cancel', event => { if (applying) event.preventDefault(); });
      dialog.addEventListener('close', () => { closed = true; controller?.destroy(); URL.revokeObjectURL(url); dialog.remove(); }, { once: true });
      cancel.onclick = () => dialog.close();
      document.body.append(dialog); dialog.showModal();
      controller = await createPhotoCropper(stage, preview, source, settings, value => {
        zoom.value = value.zoom; angle.value = value.angle; angleValue.textContent = `${value.angle.toFixed(1)}°`;
        angle.setAttribute('aria-valuetext', `${value.angle.toFixed(1)} degrees`);
        size.textContent = `Saved photo: ${value.size} × ${value.size} pixels. Original kept at ${source.naturalWidth} × ${source.naturalHeight}.`;
      });
      if (closed) { controller.destroy(); return; }
      zoom.oninput = () => controller.setZoom(Number(zoom.value));
      angle.oninput = () => controller.setAngle(Number(angle.value));
      stage.onkeydown = event => {
        const moves = { ArrowLeft: [-8,0], ArrowRight: [8,0], ArrowUp: [0,-8], ArrowDown: [0,8] };
        if (moves[event.key]) { event.preventDefault(); controller.move(...moves[event.key]); }
      };
      apply.disabled = false;
      apply.onclick = async () => {
        if (applying) return;
        applying = true; onBusy?.(true); apply.disabled = cancel.disabled = true; controls.inert = turns.inert = stage.inert = true;
        try {
          const result = await controller.export(); cropStatus.textContent = 'Uploading photo…';
          const saved = await onImageChange(result.data, result.file, { original: file, crop: result.crop, onStatus: text => { cropStatus.textContent = text; } });
          state = saved || { crop: result.crop }; originalFile = file; updateAdjust();
          image.src = result.data; photoStatus.textContent = 'Photo ready. Save changes to publish it.'; dialog.close();
        } catch (error) {
          cropStatus.textContent = error.message || 'Could not upload this photo. Try again.';
        } finally {
          applying = false; onBusy?.(false); apply.disabled = cancel.disabled = false; controls.inert = turns.inert = stage.inert = false;
        }
      };
    } catch {
      controller?.destroy(); dialog?.close(); URL.revokeObjectURL(url);
      if (!closed) photoStatus.textContent = 'Could not open this image. Try a different file.';
    }
  };
  upload.onchange = () => { const file = upload.files?.[0]; upload.value = ''; if (file) void openCrop(file); };
  adjust.onclick = async () => {
    adjust.disabled = true;
    try { await openCrop(originalFile || await readImageFile(state.original), state?.crop); }
    catch { photoStatus.textContent = 'Could not retrieve the original photo. Try again.'; }
    finally { adjust.disabled = false; }
  };
  return {
    fields, photo, image, nameInput, bioInput, linksEditor,
    choosePhoto() { if (!choose.disabled) upload.click(); },
    reset({ name, bio, links, imageSrc, photoState = null }) {
      nameInput.value = name;
      bioInput.value = bio;
      linksEditor.setLinks(links);
      image.src = imageSrc; state = photoState; originalFile = null; updateAdjust();
      photoStatus.textContent = '';
    },
    set disabled(value) {
      nameInput.disabled = bioInput.disabled = choose.disabled = adjust.disabled = value;
      linksEditor.disabled = value;
    }
  };
}
