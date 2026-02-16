import { apds } from 'apds'
import { render } from './render.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 
import { ntfy } from './ntfy.js' 
import { send } from './send.js'
import { markdown } from './markdown.js'
import { imgUpload } from './upload.js'
import { beginPublishVerification, finishPublishVerification } from './publish_status.js'

const ENABLE_EVENT_COMPOSER = false
const parseOpenedTimestamp = (opened) => {
  if (typeof opened !== 'string' || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isFinite(ts) ? ts : 0
}

async function pushLocalNotification({ hash, author, text }) {
  try {
    await fetch('/push-now', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hash,
        author,
        text,
        url: `${window.location.origin}/#${hash}`,
      }),
    })
  } catch {
    // Notifications server might be unavailable; ignore.
  }
}

export const composer = async (sig, options = {}) => {
  const obj = {}
  const isEdit = !!options.editHash && !sig
  if (sig) {
    const hash = await apds.hash(sig)
    obj.replyHash = hash
    obj.replyAuthor = sig.substring(0, 44)
    const opened = await apds.open(sig)
    const msg = await apds.parseYaml(await apds.get(opened.substring(13)))
    if (msg.name) { obj.replyName = msg.name }
    if (msg.body) {obj.replyBody = msg.body}
  }

  const contextDiv = h('div')

  if (obj.replyHash) {
    const replySymbol = h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left'])
    const author = h('a', {href: '#' + obj.replyAuthor}, [obj.replyAuthor.substring(0, 10)])
    const replyContent = h('a', {href: '#' + obj.replyHash}, [obj.replyHash.substring(0, 10)])
    contextDiv.appendChild(author)
    if (obj.replyName) { author.textContent = obj.replyName}
    if (obj.replyBody) { replyContent.textContent = obj.replyBody.substring(0, 10) + '...'}
    contextDiv.appendChild(replySymbol)
    contextDiv.appendChild(replyContent)
  }

  if (isEdit) {
    const editSymbol = h('span', {classList: 'material-symbols-outlined'}, ['Edit'])
    const editTarget = h('a', {href: '#' + options.editHash}, [options.editHash.substring(0, 10)])
    contextDiv.appendChild(editSymbol)
    contextDiv.appendChild(editTarget)
  }

  const textarea = h('textarea', {placeholder: 'Write a message'})
  if (typeof options.initialBody === 'string' && !isEdit) { textarea.value = options.initialBody }
  if (isEdit && typeof options.editBody === 'string') { textarea.value = options.editBody }

  const cancel = h('a', {classList: 'material-symbols-outlined', onclick: () => {
      if (sig) {
        div.remove()
      } else {
        overlay.remove()
      }
    }
  }, ['Cancel'])

  const replyObj = {}

  if (sig) {
    replyObj.reply = await apds.hash(sig)
    replyObj.replyto = sig.substring(0, 44)
  }
  if (isEdit) {
    replyObj.edit = options.editHash
  }

  let pubkey = await apds.pubkey()
  if (!pubkey && options.autoGenKeypair) {
    try {
      const keypair = await apds.generate()
      await apds.put('keypair', keypair)
      pubkey = await apds.pubkey()
    } catch (err) {
      // Fall back to anonymous composer if keygen fails.
    }
  }
  let composerMode = 'message'

  const eventDate = h('input', {type: 'date'})
  const makeSelect = (placeholder, values) => {
    const select = document.createElement('select')
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = placeholder
    select.appendChild(empty)
    for (const value of values) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = value
      select.appendChild(option)
    }
    return select
  }
  const timeOptions = []
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const hour24 = Math.floor(minutes / 60)
    const minute = minutes % 60
    const ampm = hour24 < 12 ? 'AM' : 'PM'
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    const label = `${hour12}:${String(minute).padStart(2, '0')}${ampm.toLowerCase()}`
    timeOptions.push(label)
  }
  const eventStartTime = makeSelect('Start time', timeOptions)
  const eventEndTime = makeSelect('End time', timeOptions)
  const fallbackTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo'
  ]
  const timezoneOptions = (typeof Intl !== 'undefined' && Intl.supportedValuesOf)
    ? Intl.supportedValuesOf('timeZone')
    : fallbackTimezones
  const eventTimezone = makeSelect('Timezone (optional)', timezoneOptions)
  const localTz = (typeof Intl !== 'undefined')
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : ''
  if (localTz) { eventTimezone.value = localTz }
  const eventLocation = h('input', {placeholder: 'Location'})
  const eventLocationStatus = h('div', {classList: 'event-location-status'})
  const locationResults = h('div', {classList: 'event-location-results'})
  const locationWrapper = h('div', {classList: 'event-location-wrapper'}, [
    eventLocation,
    locationResults
  ])
  let locationTimer
  let locationController
  let locationItems = []
  let locationHighlight = -1
  const setLocationStatus = (msg, isError = false) => {
    eventLocationStatus.textContent = msg
    eventLocationStatus.classList.toggle('error', isError)
  }
  const clearLocationResults = () => {
    locationResults.innerHTML = ''
    locationItems = []
    locationHighlight = -1
    locationResults.style.display = 'none'
  }
  const chooseLocation = (displayName, shortLabel) => {
    eventLocation.value = shortLabel || displayName
    eventLocation.dataset.full = displayName
    clearLocationResults()
    setLocationStatus('Location selected.')
  }
  const updateHighlight = () => {
    const options = locationResults.querySelectorAll('.event-location-option')
    options.forEach((option, index) => {
      option.classList.toggle('active', index === locationHighlight)
    })
  }
  const formatLocationLabel = (match) => {
    const address = match.address || {}
    const name = match.name || (match.namedetails && match.namedetails.name)
    const road = address.road
    const house = address.house_number
    const city = address.city || address.town || address.village || address.hamlet
    const region = address.state || address.region
    const country = address.country
    const street = house && road ? `${house} ${road}` : road
    const labelParts = [name, street, city, region].filter(Boolean)
    if (labelParts.length) { return labelParts.join(', ') }
    const fallbackParts = [match.display_name, country].filter(Boolean)
    return fallbackParts.join(', ') || 'Unknown'
  }
  const renderLocationResults = (data) => {
    clearLocationResults()
    locationItems = data
    locationResults.style.display = 'flex'
    for (let i = 0; i < data.length; i += 1) {
      const match = data[i]
      const label = formatLocationLabel(match)
        const option = h('div', {
          classList: 'event-location-option',
          onmousedown: (e) => {
            e.preventDefault()
            chooseLocation(match.display_name, label)
          }
        }, [label])
        locationResults.appendChild(option)
      }
  }
  const updateLocationList = async () => {
    const query = eventLocation.value.trim()
    if (query.length < 3) {
      clearLocationResults()
      setLocationStatus('')
      return
    }
    if (locationController) { locationController.abort() }
    locationController = new AbortController()
    setLocationStatus('Searching...')
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&limit=5&q=${encodeURIComponent(query)}`
      const res = await fetch(url, { headers: { 'accept': 'application/json' }, signal: locationController.signal })
      if (!res.ok) { throw new Error('Lookup failed') }
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) {
        clearLocationResults()
        setLocationStatus('No results found.', true)
        return
      }
      renderLocationResults(data)
      setLocationStatus('')
    } catch (err) {
      if (err && err.name === 'AbortError') { return }
      setLocationStatus('Could not fetch suggestions.', true)
    }
  }
  eventLocation.addEventListener('input', () => {
    clearTimeout(locationTimer)
    eventLocation.dataset.full = ''
    locationTimer = setTimeout(updateLocationList, 300)
  })
  eventLocation.addEventListener('keydown', (e) => {
    if (!locationItems.length) { return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      locationHighlight = Math.min(locationHighlight + 1, locationItems.length - 1)
      updateHighlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      locationHighlight = Math.max(locationHighlight - 1, 0)
      updateHighlight()
    } else if (e.key === 'Enter') {
      if (locationHighlight >= 0) {
        e.preventDefault()
        chooseLocation(locationItems[locationHighlight].display_name)
      }
    } else if (e.key === 'Escape') {
      clearLocationResults()
    }
  })
  eventLocation.addEventListener('blur', () => {
    setTimeout(() => { clearLocationResults() }, 150)
  })
  const eventHelp = h('div', {style: 'display: none; color: #b00020; font-size: 12px; margin: 4px 0;'})
  const eventFields = h('div', {style: 'display: none;'}, [
    h('div', [eventDate]),
    h('div', {classList: 'event-time-row'}, [eventStartTime, eventEndTime, eventTimezone]),
    h('div', [locationWrapper]),
    h('div', [eventLocationStatus]),
    h('div', [eventHelp])
  ])

  const parseTime = (label) => {
    const match = label.match(/^(\d{1,2}):(\d{2})(am|pm)$/i)
    if (!match) { return '' }
    let hour24 = Number.parseInt(match[1], 10)
    const minute = match[2]
    const ampm = match[3].toLowerCase()
    if (ampm === 'am') {
      if (hour24 === 12) { hour24 = 0 }
    } else if (ampm === 'pm') {
      if (hour24 < 12) { hour24 += 12 }
    }
    return `${String(hour24).padStart(2, '0')}:${minute}`
  }

  const buildEventYaml = () => {
    const meta = buildComposeMeta()
    const lines = ['---']
    if (meta.start) { lines.push(`start: ${meta.start}`) }
    if (meta.end) { lines.push(`end: ${meta.end}`) }
    if (meta.loc) { lines.push(`loc: ${meta.loc}`) }
    if (meta.tz) { lines.push(`tz: ${meta.tz}`) }
    lines.push('---')
    lines.push(textarea.value)
    return lines.join('\n')
  }

  const renderEventPreview = async (showRaw) => {
    const dateValue = eventDate.value || 'Date not set'
    const startLabel = eventStartTime.value || 'Start not set'
    const endLabel = eventEndTime.value || 'End not set'
    const loc = eventLocation.value.trim() || 'Location not set'
    const tz = eventTimezone.value
    content.innerHTML = ''
    if (showRaw) {
      content.textContent = buildEventYaml()
      return
    }
    const bodyHtml = await markdown(textarea.value)
    const timeLine = tz
      ? `${dateValue} • ${startLabel}–${endLabel} • ${tz}`
      : `${dateValue} • ${startLabel}–${endLabel}`
    const summary = h('div', {classList: 'event-preview'}, [
      h('div', {classList: 'event-preview-meta'}, [timeLine]),
      h('div', {classList: 'event-preview-meta'}, [loc])
    ])
    const body = h('div')
    body.innerHTML = bodyHtml
    content.appendChild(summary)
    content.appendChild(body)
  }

  const renderMessagePreview = async (showRaw) => {
    if (showRaw) {
      content.textContent = textarea.value
      return
    }
    content.innerHTML = await markdown(textarea.value)
  }

  let messageToggle
  let eventToggle
  let modeToggle
  const updateToggleState = () => {
    if (!ENABLE_EVENT_COMPOSER) { return }
    if (!messageToggle || !eventToggle) { return }
    const isEvent = composerMode === 'event'
    messageToggle.classList.toggle('active', !isEvent)
    eventToggle.classList.toggle('active', isEvent)
    messageToggle.setAttribute('aria-pressed', String(!isEvent))
    eventToggle.setAttribute('aria-pressed', String(isEvent))
    if (modeToggle) {
      modeToggle.classList.toggle('event-active', isEvent)
    }
  }

  const setComposerMode = (mode) => {
    if (!ENABLE_EVENT_COMPOSER) {
      composerMode = 'message'
      return
    }
    composerMode = mode
    if (mode === 'event') {
      eventFields.style = 'display: block;'
      textarea.placeholder = 'Write event details'
    } else {
      eventFields.style = 'display: none;'
      textarea.placeholder = 'Write a message'
    }
    updateToggleState()
  }

  const buildComposeMeta = () => {
    if (!ENABLE_EVENT_COMPOSER || composerMode !== 'event') { return { ...replyObj } }
    const meta = { ...replyObj }
    const loc = (eventLocation.dataset.full || eventLocation.value).trim()
    const dateValue = eventDate.value
    const startLabel = eventStartTime.value
    const endLabel = eventEndTime.value
    const tz = eventTimezone.value
    const startValue = startLabel ? parseTime(startLabel) : ''
    const endValue = endLabel ? parseTime(endLabel) : ''
    const start = (dateValue && startValue)
      ? Math.floor(new Date(`${dateValue}T${startValue}`).getTime() / 1000)
      : null
    const end = (dateValue && endValue)
      ? Math.floor(new Date(`${dateValue}T${endValue}`).getTime() / 1000)
      : null
    if (Number.isFinite(start)) { meta.start = start }
    if (Number.isFinite(end)) { meta.end = end }
    if (loc) { meta.loc = loc }
    if (tz) { meta.tz = tz }
    return meta
  }

  const publishButton = h('button', {style: 'float: right;', onclick: async (e) => {
    const button = e.target
    button.disabled = true
    button.textContent = 'Publishing...'
    if (ENABLE_EVENT_COMPOSER && composerMode === 'event') {
      const dateValue = eventDate.value
      const startLabel = eventStartTime.value
      const endLabel = eventEndTime.value
      const startValue = startLabel ? parseTime(startLabel) : ''
      const endValue = endLabel ? parseTime(endLabel) : ''
      const loc = (eventLocation.dataset.full || eventLocation.value).trim()
      const startMs = (dateValue && startValue)
        ? new Date(`${dateValue}T${startValue}`).getTime()
        : NaN
      const endMs = (dateValue && endValue)
        ? new Date(`${dateValue}T${endValue}`).getTime()
        : NaN
      const setHelp = (msg, focusEl) => {
        eventHelp.textContent = msg
        eventHelp.style = 'display: block; color: #b00020; font-size: 12px; margin: 4px 0;'
        if (focusEl) { focusEl.focus() }
      }
      eventHelp.style = 'display: none;'
      if (!loc) {
        setHelp('Location is required.', eventLocation)
        button.disabled = false
        button.textContent = 'Publish'
        return
      }
      if (!dateValue) {
        setHelp('Event date is required.', eventDate)
        button.disabled = false
        button.textContent = 'Publish'
        return
      }
      if (!startValue) {
        setHelp('Start time is required.', eventStartTime)
        button.disabled = false
        button.textContent = 'Publish'
        return
      }
      if (!endValue) {
        setHelp('End time is required.', eventEndTime)
        button.disabled = false
        button.textContent = 'Publish'
        return
      }
      if (endMs < startMs) {
        setHelp('End time must be after the start time.', eventEndTime)
        button.disabled = false
        button.textContent = 'Publish'
        return
      }
    }
    const published = await apds.compose(textarea.value, buildComposeMeta())
    textarea.value = ''
    const signed = await apds.get(published)
    const opened = await apds.open(signed)

    const blob = await apds.get(opened.substring(13))
    await ntfy(signed)
    await ntfy(blob)
    await send(signed)
    await send(blob)
    const hash = await apds.hash(signed)
    pushLocalNotification({ hash, author: signed.substring(0, 44), text: blob })

    const confirmTargets = [signed]
    const images = blob.match(/!\[.*?\]\((.*?)\)/g)
    if (images) {
      for (const image of images) {
        const src = image.match(/!\[.*?\]\((.*?)\)/)[1]
        const imgBlob = await apds.get(src)
        if (imgBlob) {
          await send(imgBlob)
        }
      }
    }
    const verifyId = beginPublishVerification({ hash })
    void (async () => {
      try {
        const { confirmMessagesPersisted } = await import('./websocket.js')
        const openedTs = parseOpenedTimestamp(opened)
        const since = openedTs ? Math.max(0, openedTs - 10000) : undefined
        const persisted = await confirmMessagesPersisted(confirmTargets, { since })
        finishPublishVerification(verifyId, persisted)
        if (!persisted.ok) {
          console.warn('publish confirmation failed', persisted)
        }
      } catch (err) {
        console.warn('publish confirmation errored', err)
        finishPublishVerification(verifyId, { ok: false, reason: 'unconfirmed', missing: confirmTargets })
      }
    })()

    if (isEdit) {
      render.invalidateEdits(options.editHash)
      await render.refreshEdits(options.editHash, { forceLatest: true })
      overlay.remove()
      return
    }

    if (sig) {
      div.id = hash
      if (opened) { div.dataset.opened = opened }
      await render.blob(signed, { hash, opened })
    } else {
      overlay.remove()
      const scroller = document.getElementById('scroller')
      const opened = await apds.open(signed)
      const ts = opened ? opened.substring(0, 13) : Date.now().toString()
      if (window.__feedEnqueue) {
        const src = window.location.hash.substring(1)
        // UX: if you just posted, show it immediately.
        // If the user is even slightly scrolled, adder.js will treat the new post as "pending" and show a banner,
        // which reads like "my post didn't load". Force scroll to top before enqueue so it renders right away.
        try {
          const scrollEl = document.scrollingElement || document.documentElement || document.body
          if (scrollEl) { scrollEl.scrollTop = 0 }
          window.scrollTo(0, 0)
        } catch {}
        const queued = await window.__feedEnqueue(src, { hash, ts: Number.parseInt(ts, 10), blob: signed, opened })
        if (!queued) {
          const placeholder = render.insertByTimestamp(scroller, hash, ts)
          if (placeholder) {
            if (opened) { placeholder.dataset.opened = opened }
            await render.blob(signed, { hash, opened })
          }
        }
      } else {
        const placeholder = render.insertByTimestamp(scroller, hash, ts)
        if (placeholder) {
          if (opened) { placeholder.dataset.opened = opened }
          await render.blob(signed, { hash, opened })
        }
      }
    }
  }}, ['Publish'])

  if (ENABLE_EVENT_COMPOSER) {
    messageToggle = h('button', {type: 'button', onclick: () => setComposerMode('message')}, ['Message'])
    eventToggle = h('button', {type: 'button', onclick: () => setComposerMode('event')}, ['Event'])
    const toggleIndicator = h('span', {classList: 'composer-toggle-indicator'})
    modeToggle = h('div', {classList: 'composer-toggle'}, [
      toggleIndicator,
      messageToggle,
      eventToggle
    ])
    updateToggleState()
  }

  const rawDiv = h('div', {classList: 'message-raw'})
  let rawshow = true
  let rawContent
  let rawText = ''
  const updateRawText = () => {
    rawText = (ENABLE_EVENT_COMPOSER && composerMode === 'event') ? buildEventYaml() : textarea.value
    if (rawContent) { rawContent.textContent = rawText }
  }
  const rawToggle = h('a', {classList: 'material-symbols-outlined', onclick: () => {
    updateRawText()
    if (rawshow) {
      if (!rawContent) {
        rawContent = h('pre', {classList: 'hljs'}, [rawText])
      }
      rawDiv.appendChild(rawContent)
      rawshow = false
    } else {
      rawContent.parentNode.removeChild(rawContent)
      rawshow = true
    }
  }}, ['Code'])

  const renderPreview = async () => {
    updateRawText()
    if (ENABLE_EVENT_COMPOSER && composerMode === 'event') {
      await renderEventPreview(false)
    } else {
      await renderMessagePreview(false)
    }
  }

  const uploadControls = await imgUpload(textarea)

  const previewButton = h('button', {style: 'float: right;', onclick: async () => {
    textareaDiv.style = 'display: none;'
    previewDiv.style = 'display: block;'
    uploadControls.style = 'display: none;'
    await renderPreview()
  }}, ['Preview'])

  const textareaDiv = h('div', {classList: 'composer'}, ENABLE_EVENT_COMPOSER
    ? [modeToggle, eventFields, textarea, previewButton]
    : [textarea, previewButton]
  )

  const content = h('div')

  const previewControls = h('div', {classList: 'preview-controls'}, [
    publishButton,
    h('button', {style: 'float: right;', onclick: () => { 
     textareaDiv.style = 'display: block;'
     previewDiv.style = 'display: none;'
     uploadControls.style = 'display: block;'
    }}, ['Cancel'])
  ])

  const previewDiv = h('div', {style: 'display: none;'}, [
    content,
    rawDiv,
    previewControls
  ])

  const meta = h('span', {classList: 'message-meta'}, [
    h('span', {classList: 'pubkey'}, [pubkey ? pubkey.substring(0, 6) : 'anon']),
    ' ',
    rawToggle,
    ' ',
    cancel,
  ])

  const bodyWrap = h('div', {classList: 'message-body'}, [
    contextDiv,
    textareaDiv,
    previewDiv,
    uploadControls
  ])

  const composerHeader = h('div', {classList: 'composer-header'}, ENABLE_EVENT_COMPOSER
    ? [await nameSpan(), modeToggle]
    : [await nameSpan()]
  )

  const composerDiv = h('div', [
    meta,
    h('div', {classList: 'message-main'}, [
      h('span', [await avatarSpan()]),
      h('div', {classList: 'message-stack'}, [
        composerHeader,
        bodyWrap
      ])
    ])
  ])

  const div = h('div', {classList: 'message modal-content'}, [
    composerDiv
  ])

  if (sig) { 
    div.className = 'message reply'
    div.id = 'reply-composer-' + obj.replyHash
  }

  const overlay = h('div', {
    classList: 'modal-overlay',
    onclick: (e) => {
      if (e.target === overlay) {
        overlay.remove()
      }
    }
  }, [div])

  if (sig) { return div }

  return overlay
  
}
