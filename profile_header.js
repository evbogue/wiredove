import { serializeWebsiteWrite } from './client/runtime/signing-queue.js'
import { apds } from 'apds'
import { h } from 'h'
import { appendMarkdown } from './markdown.js'
import { send } from './send.js'
import { profileLinksFromHistory } from './client/profile-links.js'
import { renderProfileLinks } from './client/ui/profile-links.js'
import { createProfileEditor } from './client/ui/profile-editor.js'
import { resolveImageSrc } from './profile_image.js'
import { uploadProfilePhoto } from './upload.js'
import { downloadIdentityBackup } from './identity_backup.js'

const isHash = (value) => typeof value === 'string' && value.length === 44

const isReplyYaml = (yaml) => {
  if (!yaml) { return false }
  return Boolean(yaml.reply || yaml.replyHash || yaml.replyto || yaml.replyTo)
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
  let bio = null
  let background = null
  let latestImage = null

  if (sorted[0] && sorted[0].yaml && typeof sorted[0].yaml.image === 'string') {
    latestImage = sorted[0].yaml.image.trim()
  }

  for (const entry of sorted) {
    if (!name && typeof entry.yaml.name === 'string') {
      name = entry.yaml.name.trim()
    }
    if (bio === null && typeof entry.yaml.bio === 'string') {
      bio = entry.yaml.bio.trim()
    }
    if (!background && typeof entry.yaml.background === 'string') {
      background = entry.yaml.background.trim()
    }
    if (name && bio && background) { break }
  }

  return {
    name: name || fallbackName,
    bio: bio ?? '',
    background,
    image: latestImage,
    photoState: (() => {
      const row = sorted.find(entry => entry.yaml.image === latestImage && entry.yaml.image_original && entry.yaml.image_crop);
      return row ? { image: latestImage, original: row.yaml.image_original, crop: row.yaml.image_crop } : null;
    })(),
    links: profileLinksFromHistory(sorted),
  }
}

const publishProfileUpdate = async ({ bio, name, image, links, photoState, session }) => {
  const meta = {}
  if (bio !== null && bio !== undefined) { meta.bio = bio }
  if (name !== null && name !== undefined && name !== '') { meta.name = name }
  if (image) { meta.image = image }
  if (links !== null && links !== undefined) { meta.links = links }
  // compose() overrides explicit name/image with local values. Sign the intended
  // profile metadata with the same previous-message contract instead.
  const localName = await apds.get('name')
  const localImage = await apds.get('image')
  const previous = await apds.get('previous')
  if (!meta.name && localName) meta.name = localName
  if (!meta.image && localImage) meta.image = localImage
  const storedPhoto = photoState || await apds.get('profile_photo')
  if (storedPhoto && storedPhoto.image === meta.image && storedPhoto.original && storedPhoto.crop) {
    meta.image_original = storedPhoto.original
    meta.image_crop = storedPhoto.crop
  }
  if (previous) meta.previous = previous
  const result = session?.artifacts ? await session.artifacts.publish('', meta) : null
  const published = result?.id || await apds.sign(await apds.createYaml(meta, ''))
  // APDS normally flushes these indexes on a timer. A saved profile must survive
  // an immediate reload, including an explicit empty bio.
  await apds.put('hashlog', JSON.stringify(await apds.getHashLog()))
  await apds.put('openedlog', JSON.stringify(await apds.getOpenedLog()))
  const signed = await apds.get(published)
  const opened = await apds.open(signed)
  const blob = await apds.get(opened.substring(13))
  if (!result || session?.legacyNetwork) { await send(signed); await send(blob) }
  if (isHash(image)) { await send(image) }
  return { signed, blob }
}

export const buildProfileHeader = async ({ label, messages, canEdit = false, pubkey = null, root = document, runExclusive = serializeWebsiteWrite, session }) => {
  const profile = await buildProfileData(messages, label)
  const backgroundImage = await resolveImageSrc(profile.background)
  const fallbackVisual = pubkey ? await apds.visual(pubkey) : null
  const fallbackVisualSrc = fallbackVisual && fallbackVisual.src ? fallbackVisual.src : null
  let currentName = profile.name || label
  let currentBio = profile.bio || ''
  let currentLinks = profile.links || []
  let currentImageHash = profile.image || null
  let currentPhotoState = profile.photoState

  if (canEdit && pubkey) {
    const localLog = await apds.query(pubkey)
    if (localLog && localLog.length) {
      const localProfile = await buildProfileData(localLog, label)
      if (localProfile.name) { currentName = localProfile.name }
      currentBio = localProfile.bio
      if (localProfile.links !== null) { currentLinks = localProfile.links }
      if (localProfile.image) { currentImageHash = localProfile.image; currentPhotoState = localProfile.photoState }
    }
    const localName = await apds.get('name')
    if (localName) { currentName = localName }
    const localImage = await apds.get('image')
    if (localImage) { currentImageHash = localImage }
    const localPhoto = await apds.get('profile_photo')
    if (localPhoto?.image === currentImageHash) currentPhotoState = localPhoto
  }

  const profileImage = await resolveImageSrc(currentImageHash)
  let currentImageSrc = profileImage || fallbackVisualSrc || ''
  let draftImageHash = currentImageHash
  let draftImageSrc = currentImageSrc
  let draftPhotoState = currentPhotoState
  let photoBusy = false
  let viewAvatarImgRef = null
  const header = h('div', { classList: 'message profile-header' })

  if (backgroundImage) {
    header.style.backgroundImage = `url(${backgroundImage})`
  }

  const editor = createProfileEditor({
    name: currentName, bio: currentBio, links: currentLinks, imageSrc: draftImageSrc,
    photoState: draftPhotoState,
    onBusy: value => { photoBusy = value; saveButton.disabled = cancelButton.disabled = value },
    onImageChange: async (src, cropped, options) => {
      const saved = await uploadProfilePhoto(cropped, { ...options, service: session?.policy })
      draftImageHash = saved.image
      draftPhotoState = saved
      draftImageSrc = src
      return saved
    }
  })
  const viewAvatar = h('img', {
    classList: 'post-image profile-avatar profile-view-only', src: draftImageSrc,
    alt: `${currentName || label} profile photo`
  })
  viewAvatarImgRef = viewAvatar
  const avatar = h('div', { classList: 'profile-avatar-wrap' }, [viewAvatar])
  if (canEdit) avatar.append(editor.photo)

  const nameText = h('h2', { classList: 'profile-view-only' }, [currentName || label])
  const nameEditor = editor.nameInput
  const bioPreview = h('div', { classList: 'profile-bio profile-view-only' })
  appendMarkdown(bioPreview, currentBio || '')

  const input = editor.bioInput
  const linksView = h('nav', { classList: 'profile-view-only' })
  renderProfileLinks(linksView, currentLinks)
  const linksEditor = editor.linksEditor
  const status = h('div', { classList: 'profile-bio-status', role: 'status' })
  status.setAttribute('aria-live', 'polite')
  editor.fields.addEventListener('input', () => { status.textContent = '' })
  const editButton = h('button', { type: 'button', classList: canEdit ? 'profile-view-only' : 'hidden' }, ['Edit profile'])
  if (!canEdit) { editButton.style.display = 'none' }
  const saveButton = h('button', { type: 'button', classList: 'primary-action' }, ['Save changes'])
  const cancelButton = h('button', { type: 'button' }, ['Cancel'])

  const setEditing = (isEditing) => {
    header.classList.toggle('profile-editing', isEditing)
    status.textContent = ''
  }

  saveButton.onclick = async () => {
    if (photoBusy) return
    let linksValue
    try { linksValue = linksEditor.getLinks() }
    catch (error) { status.textContent = error.message; return }
    const linksChanged = JSON.stringify(linksValue) !== JSON.stringify(currentLinks)
    const value = input.value.trim()
    const nameValue = nameEditor.value.trim()
    if (!nameValue) { status.textContent = 'Enter a display name.'; nameEditor.focus(); return }
    const nameChanged = nameValue !== currentName || onboarding
    const bioChanged = value !== currentBio
    const imageChanged = draftImageHash && draftImageHash !== currentImageHash
    if (!nameChanged && !bioChanged && !imageChanged && !linksChanged) {
      setEditing(false)
      if (onboarding) finishSetup()
      return
    }
    saveButton.disabled = true
    cancelButton.disabled = true
    linksEditor.disabled = true
    input.disabled = true
    nameEditor.disabled = true
    editor.disabled = true
    status.textContent = 'Saving...'
    try {
      await runExclusive(async () => {
        await publishProfileUpdate({
          session,
          bio: bioChanged ? value : null,
          name: nameChanged ? nameValue : null,
          image: imageChanged ? draftImageHash : null,
          photoState: draftPhotoState,
          links: linksChanged ? linksValue : null
        })
        if (nameChanged) { await apds.put('name', nameValue) }
        if (imageChanged) { await apds.put('image', draftImageHash); await apds.put('profile_photo', draftPhotoState) }
      })
      if (linksChanged) { currentLinks = linksValue }
      renderProfileLinks(linksView, currentLinks)
      if (nameChanged) { currentName = nameValue }
      if (bioChanged) { currentBio = value }
      if (imageChanged) {
        currentImageHash = draftImageHash
        currentPhotoState = draftPhotoState
        currentImageSrc = draftImageSrc
      }
      bioPreview.replaceChildren()
      appendMarkdown(bioPreview, currentBio || '')
      nameText.textContent = currentName || label
      if (draftImageSrc && viewAvatarImgRef && viewAvatarImgRef.tagName === 'IMG') {
        viewAvatarImgRef.src = draftImageSrc
      }
      setEditing(false)
      status.textContent = 'Profile saved. Updates are queued for sharing.'
      if (onboarding) finishSetup()
      const navImage = root.querySelector('#navbar .navbar-right .avatar_small')
      if (navImage && imageChanged) navImage.src = draftImageSrc
    } catch (error) {
      status.textContent = 'Failed to save profile: ' + error.message
    } finally {
      saveButton.disabled = false
      cancelButton.disabled = false
      linksEditor.disabled = false
      input.disabled = false
      nameEditor.disabled = false
      editor.disabled = false
    }
  }

  editButton.onclick = () => {
    linksEditor.setLinks(currentLinks)
    input.value = currentBio || ''
    nameEditor.value = currentName || ''
    editor.reset({ name: currentName, bio: currentBio, links: currentLinks, imageSrc: currentImageSrc, photoState: currentPhotoState })
    setEditing(true)
    nameEditor.focus()
  }

  cancelButton.onclick = () => {
    linksEditor.setLinks(currentLinks)
    input.value = currentBio || ''
    nameEditor.value = currentName || ''
    draftPhotoState = currentPhotoState
    draftImageHash = currentImageHash
    draftImageSrc = currentImageSrc
    editor.reset({ name: currentName, bio: currentBio, links: currentLinks, imageSrc: currentImageSrc, photoState: currentPhotoState })
    setEditing(false)
  }

  let onboarding = canEdit && sessionStorage.getItem('wiredove.setup') === pubkey
  const setupIntro = h('div', { classList: 'profile-setup-intro' }, [
    h('p', { classList: 'profile-help' }, ['Step 2 of 3']),
    h('h2', ['Make yourself at home']),
    h('p', ['Add a photo, bio, or links. You can change these later.'])
  ])
  setupIntro.hidden = !onboarding
  const backupButton = h('button', { type: 'button', onclick: async () => {
    try { await downloadIdentityBackup(); backupStatus.textContent = 'Backup downloaded. Keep it somewhere private.' }
    catch { backupStatus.textContent = 'Could not download your backup. Please try again.' }
  } }, ['Download identity backup'])
  const backupStatus = h('p', { role: 'status' })
  const backupCard = h('section', { classList: 'identity-backup' }, [
    h('p', { classList: 'profile-help' }, ['Step 3 of 3']),
    h('h3', ['Your identity is ready']),
    h('p', ['Save a private backup to use this identity on another device or recover it if browser data is cleared. Anyone with this file can use your identity.']),
    backupButton, backupStatus
  ])
  backupCard.hidden = true
  const finishSetup = () => {
    onboarding = false
    sessionStorage.removeItem('wiredove.setup')
    setupIntro.hidden = true
    backupCard.hidden = false
    cancelButton.textContent = 'Cancel'
  }
  if (onboarding) {
    cancelButton.textContent = 'Skip for now'
    const cancel = cancelButton.onclick
    cancelButton.onclick = () => { cancel(); finishSetup() }
  }
  setEditing(onboarding)

  const content = h('div', { classList: 'profile-header-content' }, [
    setupIntro,
    nameText,
    bioPreview,
    linksView,
    editButton,
    editor.fields,
    h('p', { classList: 'profile-help profile-edit-only' }, ['Saving publishes a public profile update. Previous versions may remain available.']),
    h('div', { classList: 'profile-actions profile-edit-only' }, [saveButton, cancelButton]),
    status,
    backupCard
  ])

  const layout = h('div', { classList: 'profile-header-layout' }, [avatar, content])
  header.appendChild(layout)
  return header
}
