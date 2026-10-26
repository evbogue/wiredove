import { iconButton } from './composer-surface.js';
const recorderMime = (kind) => {
  const choices = kind === 'video'
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return choices.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || ''
}

// Upload adapter owns persistence; this widget owns recording and attachment UI.
export function createMediaControls({ onAttachment, onBusy, persistMedia } = {}) {
  const root = document.createElement('div');
  root.className = 'media-composer';
  const actions = document.createElement('div');
  actions.className = 'media-actions';
  const status = document.createElement('div');
  status.className = 'media-compose-status';
  status.setAttribute('role', 'status');
  const preview = document.createElement('div');
  preview.className = 'media-compose-preview';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'audio/*,video/*'; input.hidden = true;
  root.append(status, preview, input);
  let currentUrl, recorder, stream, timer;
  let generation = 0, disposed = false, busy = false;
  const setStatus = (text, error = false) => { status.textContent = text; status.classList.toggle('error', error); };
  const controls = [];
  const setBusy = value => { busy = value; onBusy?.(value); controls.forEach(button => { button.disabled = value; }); };
  const clearPreview = () => {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null; preview.replaceChildren();
  };
  const reset = () => {
    generation++; failed = false;
    clearInterval(timer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    stream = recorder = null;
    controls.forEach(button => { button.classList.remove('recording'); button.removeAttribute('aria-pressed'); });
    audio.firstChild.textContent = 'mic'; video.firstChild.textContent = 'videocam';
    audio.title = 'Record audio'; audio.setAttribute('aria-label', 'Record audio');
    video.title = 'Record video'; video.setAttribute('aria-label', 'Record video');
    clearPreview(); setStatus(''); setBusy(false); onAttachment?.(null);
  };
  let failed = false;
  const persist = async (blob, token = generation) => {
    if (disposed || token !== generation) return;
    if (!blob.size) { setStatus('The selected media is empty', true); setBusy(false); return; }
    failed = false;
    clearPreview();
    const player = document.createElement(blob.type.startsWith('image/') ? 'img' : blob.type.startsWith('video/') ? 'video' : 'audio');
    if (player.tagName === 'IMG') player.alt = blob.name || 'Attached image';
    player.controls = true; player.playsInline = true; player.className = 'media-player';
    currentUrl = URL.createObjectURL(blob); player.src = currentUrl;
    const remove = iconButton('Remove attachment', 'close', reset);
    preview.append(player, remove);
    setBusy(true); setStatus('Uploading media…');
    onAttachment?.(null);
    try {
      const attachment = await persistMedia(blob);
      if (disposed || token !== generation) return;
      onAttachment?.(attachment); setStatus('Attachment ready');
    } catch (error) {
      if (disposed || token !== generation) return;
      setStatus(error.message || 'Could not upload media. Remove it and try again.', true);
      failed = true;
    } finally {
      if (!disposed && token === generation) { setBusy(false); if (failed) onBusy?.(true); }
    }
  };
  const startRecording = async (kind, clicked) => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (busy || disposed) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setStatus('Recording is not supported in this browser', true); return; }
    reset();
    const token = generation;
    setBusy(true); setStatus('Waiting for permission…');
    try {
      const capture = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: { facingMode: 'environment' } } : { audio: true });
      if (disposed || token !== generation) { capture.getTracks().forEach(track => track.stop()); return; }
      stream = capture;
      const chunks = [];
      const mime = recorderMime(kind);
      const active = mime ? new MediaRecorder(capture, { mimeType: mime }) : new MediaRecorder(capture);
      recorder = active;
      active.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      let captureTimer;
      active.onstop = async () => {
        clearInterval(captureTimer);
        capture.getTracks().forEach(track => track.stop());
        if (disposed || token !== generation) return;
        stream = recorder = null;
        clicked.classList.remove('recording'); clicked.setAttribute('aria-pressed', 'false');
        clicked.firstChild.textContent = kind === 'video' ? 'videocam' : 'mic';
        clicked.title = `Record ${kind}`; clicked.setAttribute('aria-label', clicked.title);
        const type = active.mimeType || mime || (kind === 'video' ? 'video/webm' : 'audio/webm');
        const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        await persist(new File(chunks, `${kind}-${Date.now()}.${extension}`, { type }), token);
      };
      active.start(1000);
      clicked.disabled = false;
      clicked.firstChild.textContent = 'stop'; clicked.title = `Stop recording ${kind}`;
      clicked.setAttribute('aria-label', clicked.title); clicked.setAttribute('aria-pressed', 'true'); clicked.classList.add('recording');
      const started = Date.now();
      const tick = () => { const seconds = Math.floor((Date.now() - started) / 1000); setStatus(`Recording ${kind} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`); };
      tick(); timer = captureTimer = setInterval(tick, 1000);
    } catch (error) {
      if (disposed || token !== generation) return;
      stream?.getTracks().forEach(track => track.stop()); stream = recorder = null;
      setBusy(false); setStatus('Could not start recording. Check camera/microphone permission.', true);
    }
  };
  const audio = iconButton('Record audio', 'mic', () => startRecording('audio', audio));
  const video = iconButton('Record video', 'videocam', () => startRecording('video', video));
  const upload = iconButton('Upload audio or video', 'upload_file', () => input.click());
  controls.push(audio, video, upload); actions.append(...controls);
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) { setStatus('Choose an audio or video file', true); return; }
    reset(); await persist(file);
  });
  root.attach = async file => { reset(); await persist(file); };
  root.restore = attachment => {
    const player = document.createElement(attachment.type === 'video' ? 'video' : 'audio');
    player.controls = true; player.playsInline = true; player.className = 'media-player';
    player.src = attachment.media_url;
    preview.append(player, iconButton('Remove attachment', 'close', reset));
    setStatus('Attachment ready');
  };
  root.reset = reset;
  root.actions = actions;
  root.destroy = () => { disposed = true; reset(); };
  return root;
}
