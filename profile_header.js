import { apds } from 'apds'
import { h } from 'h'
import { markdown } from './markdown.js'
import { send } from './send.js'

const isHash = (value) => typeof value === 'string' && value.length === 44

const isReplyYaml = (yaml) => {
  if (!yaml) { return false }
  return Boolean(yaml.reply || yaml.replyHash || yaml.replyto || yaml.replyTo)
}

const resolveImageSrc = async (value) => {
  if (!value || typeof value !== 'string') { return null }
  if (isHash(value)) {
    const blob = await apds.get(value)
    if (blob) { return blob }
    await send(value)
    return null
  }
  return value
}

const normalizeMessages = async (messages) => {
  if (!Array.isArray(messages)) { return [] }
  const parsed = await Promise.all(messages.map(async (msg) => {
    if (!msg || typeof msg !== 'object') { return null }
    const text = typeof msg.text === 'string' ? msg.text : ''
    if (!text) { return null }
    const yaml = await apds.parseYaml(text)
    const ts = Number.parseInt(msg.ts || '0', 10)
    return {
      msg,
      yaml: yaml || {},
      ts: Number.isNaN(ts) ? 0 : ts,
    }
  }))
  return parsed.filter(Boolean)
}

const buildProfileData = async (messages, fallbackName) => {
  const normalized = await normalizeMessages(messages)
  const nonReplies = normalized.filter((entry) => !isReplyYaml(entry.yaml))
  const sorted = nonReplies.sort((a, b) => b.ts - a.ts)

  let name = ''
  let bio = ''
  let background = null
  let latestImage = null

  if (sorted[0] && sorted[0].yaml && typeof sorted[0].yaml.image === 'string') {
    latestImage = sorted[0].yaml.image.trim()
  }

  for (const entry of sorted) {
    if (!name && typeof entry.yaml.name === 'string') {
      name = entry.yaml.name.trim()
    }
    if (!bio && typeof entry.yaml.bio === 'string') {
      bio = entry.yaml.bio.trim()
    }
    if (!background && typeof entry.yaml.background === 'string') {
      background = entry.yaml.background.trim()
    }
    if (name && bio && background) { break }
  }

  return {
    name: name || fallbackName,
    bio,
    background,
    image: latestImage,
  }
}

const publishProfileUpdate = async ({ bio, name, image }) => {
  const meta = {}
  if (bio !== null && bio !== undefined && bio !== '') { meta.bio = bio }
  if (name !== null && name !== undefined && name !== '') { meta.name = name }
  if (image) { meta.image = image }
  const published = await apds.compose('', meta)
  const signed = await apds.get(published)
  const opened = await apds.open(signed)
  const blob = await apds.get(opened.substring(13))
  await send(signed)
  await send(blob)
  if (image) { await send(image) }
  return { signed, blob }
}

export const buildProfileHeader = async ({ label, messages, canEdit = false, pubkey = null }) => {
  const profile = await buildProfileData(messages, label)
  const backgroundImage = await resolveImageSrc(profile.background)
  const fallbackVisual = pubkey ? await apds.visual(pubkey) : null
  const fallbackVisualSrc = fallbackVisual && fallbackVisual.src ? fallbackVisual.src : null
  let currentName = profile.name || label
  let currentBio = profile.bio || ''
  let currentImageHash = profile.image || null

  if (canEdit && pubkey) {
    const localLog = await apds.query(pubkey)
    if (localLog && localLog.length) {
      const localProfile = await buildProfileData(localLog, label)
      if (localProfile.name) { currentName = localProfile.name }
      if (localProfile.bio) { currentBio = localProfile.bio }
      if (localProfile.image) { currentImageHash = localProfile.image }
    }
    const localName = await apds.get('name')
    if (localName) { currentName = localName }
    const localImage = await apds.get('image')
    if (localImage) { currentImageHash = localImage }
  }

  const profileImage = await resolveImageSrc(currentImageHash)
  let currentImageSrc = profileImage || fallbackVisualSrc || ''
  let draftImageHash = currentImageHash
  let draftImageSrc = currentImageSrc
  let editAvatarImgRef = null
  let viewAvatarImgRef = null
  const header = h('div', { classList: 'message profile-header' })

  if (backgroundImage) {
    header.style.backgroundImage = `url(${backgroundImage})`
  }

  let avatar
  if (canEdit) {
    const editAvatarImg = h('img', {
      classList: 'profile-avatar profile-edit-only',
      src: draftImageSrc,
      alt: `${currentName || label} profile photo`
    })
    editAvatarImgRef = editAvatarImg
    const uploader = h('input', { type: 'file', accept: 'image/*', style: 'display: none;' })
    editAvatarImg.onclick = () => { uploader.click() }

    draftImageSrc = editAvatarImg.src || ''

    uploader.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0]
      if (!file) { return }
      const reader = new FileReader()
      reader.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()
        img.onload = async () => {
          const size = 256
          const minSide = Math.min(img.width, img.height)
          const sx = Math.floor((img.width - minSide) / 2)
          const sy = Math.floor((img.height - minSide) / 2)
          canvas.width = size
          canvas.height = size
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)
          const croppedImage = canvas.toDataURL()
          editAvatarImg.src = croppedImage
          draftImageSrc = croppedImage
          draftImageHash = await apds.make(croppedImage)
        }
        img.src = reader.result
      }
      reader.readAsDataURL(file)
    })

    const editAvatar = h('span', { classList: 'profile-edit-only' }, [
      editAvatarImg,
      uploader
    ])

    const viewAvatar = h('img', {
      classList: 'post-image profile-avatar profile-view-only',
      src: draftImageSrc,
      alt: `${currentName || label} profile photo`
    })
    viewAvatarImgRef = viewAvatar

    avatar = h('div', { classList: 'profile-avatar-wrap' }, [
      viewAvatar,
      editAvatar
    ])
  } else {
    avatar = h('img', {
      classList: 'post-image profile-avatar',
      src: draftImageSrc,
      alt: `${currentName || label} profile photo`
    })
  }

  const nameText = h('h2', { classList: 'profile-view-only' }, [currentName || label])
  const nameEditor = h('input', {
    classList: 'profile-edit-only',
    placeholder: currentName || label
  })
  nameEditor.value = currentName || ''

  const bioPreview = h('div', { classList: 'profile-bio profile-view-only' })
  bioPreview.innerHTML = await markdown(currentBio || '')

  const input = h('textarea', {
    classList: 'profile-edit-only',
    placeholder: currentBio ? 'Update your bio' : 'Write a short bio'
  })
  input.value = currentBio
  const status = h('div', { classList: 'profile-bio-status profile-edit-only' })
  const editButton = h('button', { type: 'button', classList: canEdit ? 'profile-view-only' : 'hidden' }, ['Edit profile'])
  if (!canEdit) { editButton.style.display = 'none' }
  const saveButton = h('button', { type: 'button', classList: 'profile-edit-only' }, ['Save profile'])
  const cancelButton = h('button', { type: 'button', classList: 'profile-edit-only' }, ['Cancel'])

  const setEditing = (isEditing) => {
    header.classList.toggle('profile-editing', isEditing)
    status.textContent = ''
  }

  saveButton.onclick = async () => {
    const value = input.value.trim()
    const nameValue = nameEditor.value.trim()
    const nameChanged = nameValue && nameValue !== currentName
    const bioChanged = value && value !== currentBio
    const imageChanged = draftImageHash && draftImageHash !== currentImageHash
    if (!nameChanged && !bioChanged && !imageChanged) {
      setEditing(false)
      return
    }
    saveButton.disabled = true
    status.textContent = 'Saving...'
    try {
      await publishProfileUpdate({
        bio: bioChanged ? value : null,
        name: nameChanged ? nameValue : null,
        image: imageChanged ? draftImageHash : null
      })
      if (nameChanged) { await apds.put('name', nameValue) }
      if (imageChanged) { await apds.put('image', draftImageHash) }
      if (nameChanged) { currentName = nameValue }
      if (bioChanged) { currentBio = value }
      if (imageChanged) {
        currentImageHash = draftImageHash
        currentImageSrc = draftImageSrc
      }
      const rendered = await markdown(currentBio || '')
      bioPreview.innerHTML = rendered
      nameText.textContent = currentName || label
      if (draftImageSrc && viewAvatarImgRef && viewAvatarImgRef.tagName === 'IMG') {
        viewAvatarImgRef.src = draftImageSrc
      }
      setEditing(false)
    } catch {
      status.textContent = 'Failed to save profile.'
    } finally {
      saveButton.disabled = false
    }
  }

  editButton.onclick = () => {
    input.value = currentBio || ''
    nameEditor.value = currentName || ''
    if (draftImageSrc && editAvatarImgRef) { editAvatarImgRef.src = draftImageSrc }
    setEditing(true)
  }

  cancelButton.onclick = () => {
    input.value = currentBio || ''
    nameEditor.value = currentName || ''
    draftImageHash = currentImageHash
    draftImageSrc = currentImageSrc
    if (editAvatarImgRef) { editAvatarImgRef.src = draftImageSrc }
    setEditing(false)
  }

  setEditing(false)

  const content = h('div', { classList: 'profile-header-content' }, [
    nameText,
    nameEditor,
    bioPreview,
    editButton,
    input,
    saveButton,
    cancelButton,
    status
  ])

  const layout = h('div', { classList: 'profile-header-layout' }, [
    avatar,
    content
  ])

  header.appendChild(layout)
  return header
}
