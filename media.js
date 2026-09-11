import { IndexedDBBlobStore, HttpBlobStore, putBlob, getBlob } from './anproto_blob.js'

const localStore = new IndexedDBBlobStore('wiredove-media-v1')
const remoteStore = new HttpBlobStore('/blobs')

const mediaType = (mime = '') => mime.startsWith('video/') ? 'video' : 'audio'

export async function storeMedia(input, { onStatus } = {}) {
  const type = mediaType(input.type)
  onStatus?.('Hashing + storing locally…')
  const blob = await putBlob(input, localStore)
  onStatus?.('Uploading verified chunks…')
  const remoteBlob = await putBlob(input, remoteStore)
  if (blob !== remoteBlob) throw new Error('local and remote blob IDs differ')
  onStatus?.('Ready to publish')
  return {
    type,
    blob,
    mime: input.type || (type === 'video' ? 'video/webm' : 'audio/webm'),
    media_name: input.name || `${type}-${Date.now()}.webm`,
    media_size: input.size || 0
  }
}

export async function loadMediaBytes(id) {
  try {
    return await getBlob(id, localStore)
  } catch {
    const bytes = await getBlob(id, remoteStore)
    // Re-store verified reconstructed bytes locally. putBlob re-derives the same ID.
    const cached = await putBlob(bytes, localStore)
    if (cached !== id) throw new Error('downloaded media changed identity')
    return bytes
  }
}

export async function renderMedia(yaml, container) {
  if (!yaml || !yaml.blob || !['audio', 'video'].includes(yaml.type)) return false

  const wrap = document.createElement('div')
  wrap.className = 'media-post'

  const status = document.createElement('div')
  status.className = 'media-status'
  status.textContent = 'Loading verified blob…'
  wrap.appendChild(status)

  const player = document.createElement(yaml.type)
  player.controls = true
  player.preload = 'metadata'
  if (yaml.type === 'video') player.playsInline = true
  player.className = 'media-player'
  wrap.appendChild(player)
  container.appendChild(wrap)

  try {
    const bytes = await loadMediaBytes(yaml.blob)
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: yaml.mime || '' }))
    player.src = objectUrl
    player.addEventListener('emptied', () => URL.revokeObjectURL(objectUrl), { once: true })
    status.textContent = 'Verified ANProto blob'
  } catch (err) {
    status.textContent = 'Media unavailable'
    status.classList.add('error')
    console.warn('media load failed', yaml.blob, err)
  }
  return true
}

const recorderMime = (kind) => {
  const choices = kind === 'video'
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return choices.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || ''
}

export function createMediaComposer({ onAttachment }) {
  const root = document.createElement('div')
  root.className = 'media-composer'

  const actions = document.createElement('div')
  actions.className = 'media-actions'
  root.appendChild(actions)

  const status = document.createElement('div')
  status.className = 'media-compose-status'
  root.appendChild(status)

  const preview = document.createElement('div')
  preview.className = 'media-compose-preview'
  root.appendChild(preview)

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*,video/*'
  input.hidden = true
  root.appendChild(input)

  let currentUrl = null
  let recorder = null
  let stream = null
  let chunks = []

  const setStatus = (text, error = false) => {
    status.textContent = text
    status.classList.toggle('error', error)
  }

  const clearPreview = () => {
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    currentUrl = null
    preview.innerHTML = ''
  }

  const showPreview = (blob, type) => {
    clearPreview()
    const player = document.createElement(type)
    player.controls = true
    if (type === 'video') player.playsInline = true
    player.className = 'media-player'
    currentUrl = URL.createObjectURL(blob)
    player.src = currentUrl
    preview.appendChild(player)
  }

  const persist = async (blob) => {
    const type = mediaType(blob.type)
    showPreview(blob, type)
    try {
      const attachment = await storeMedia(blob, { onStatus: setStatus })
      onAttachment?.(attachment)
    } catch (err) {
      console.error(err)
      setStatus('Could not store media', true)
      onAttachment?.(null)
    }
  }

  const stopCapture = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  const reset = () => {
    stopCapture()
    if (stream) stream.getTracks().forEach(track => track.stop())
    stream = null
    recorder = null
    chunks = []
    clearPreview()
    setStatus('')
    onAttachment?.(null)
  }

  const button = (label, icon, handler) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'media-action'
    b.innerHTML = `<span class="material-symbols-outlined">${icon}</span><span>${label}</span>`
    b.addEventListener('click', handler)
    actions.appendChild(b)
    return b
  }

  button('Write', 'edit', reset)

  const startRecording = async (kind, clicked) => {
    if (recorder && recorder.state === 'recording') {
      stopCapture()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus('Recording is not supported in this browser', true)
      return
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia(kind === 'video'
        ? { audio: true, video: { facingMode: 'environment' } }
        : { audio: true })
      chunks = []
      const mimeType = recorderMime(kind)
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorder.ondataavailable = event => {
        if (event.data && event.data.size) chunks.push(event.data)
      }
      recorder.onstop = async () => {
        const type = recorder.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm')
        const blob = new Blob(chunks, { type })
        Object.defineProperty(blob, 'name', { value: `${kind}-${Date.now()}.webm` })
        stream?.getTracks().forEach(track => track.stop())
        stream = null
        recorder = null
        clicked.classList.remove('recording')
        clicked.querySelector('span:last-child').textContent = kind === 'video' ? 'Video' : 'Audio'
        await persist(blob)
      }
      recorder.start(1000)
      clicked.classList.add('recording')
      clicked.querySelector('span:last-child').textContent = 'Stop'
      setStatus(`Recording ${kind}…`)
    } catch (err) {
      console.error(err)
      setStatus('Camera/microphone permission failed', true)
    }
  }

  const audioButton = button('Audio', 'mic', () => startRecording('audio', audioButton))
  const videoButton = button('Video', 'videocam', () => startRecording('video', videoButton))
  button('Upload', 'upload_file', () => input.click())

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      setStatus('Choose an audio or video file', true)
      return
    }
    await persist(file)
  })

  root.destroy = reset
  return root
}
