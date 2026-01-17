import { apds } from 'apds'
import { render } from './render.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 
import { ntfy } from './ntfy.js' 
import { send } from './send.js'
import { markdown } from './markdown.js'
import { imgUpload } from './upload.js'

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

  const pubkey = await apds.pubkey()

  const publishButton = h('button', {style: 'float: right;', onclick: async (e) => {
    e.target.disabled = true
    e.target.textContent = 'Publishing...'
    const published = await apds.compose(textarea.value, replyObj)
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

    const images = blob.match(/!\[.*?\]\((.*?)\)/g)
    if (images) {
      for (const image of images) {
        const src = image.match(/!\[.*?\]\((.*?)\)/)[1]
        const imgBlob = await apds.get(src)
        if (imgBlob) { await send(imgBlob) }
      }
    }

    if (isEdit) {
      render.invalidateEdits(options.editHash)
      await render.refreshEdits(options.editHash, { forceLatest: true })
      overlay.remove()
      return
    }

    if (sig) {
      div.id = hash
      await render.blob(signed)
    } else {
      const scroller = document.getElementById('scroller')
      const opened = await apds.open(signed)
      const ts = opened ? opened.substring(0, 13) : Date.now().toString()
      if (window.__feedEnqueue) {
        const src = window.location.hash.substring(1)
        const queued = await window.__feedEnqueue(src, { hash, ts: Number.parseInt(ts, 10), blob: signed })
        if (!queued) {
          const placeholder = render.insertByTimestamp(scroller, hash, ts)
          if (placeholder) {
            await render.blob(signed)
          }
        }
      } else {
        const placeholder = render.insertByTimestamp(scroller, hash, ts)
        if (placeholder) {
          await render.blob(signed)
        }
      }
      overlay.remove()
    }
  }}, ['Publish'])

  const previewButton = h('button', {style: 'float: right;', onclick: async () => {
    textareaDiv.style = 'display: none;'
    previewDiv.style = 'display: block;'
    content.innerHTML = await markdown(textarea.value)
  }}, ['Preview'])

  const textareaDiv = h('div', {classList: 'composer'}, [
    textarea,
    previewButton
  ])

  const content = h('div')

  const previewDiv = h('div', {style: 'display: none;'}, [
    content,
    publishButton,
    h('button', {style: 'float: right;', onclick: () => { 
     textareaDiv.style = 'display: block;'
     previewDiv.style = 'display: none;'
    }}, ['Cancel'])
  ])

  const meta = h('span', {classList: 'message-meta'}, [
    h('span', {classList: 'pubkey'}, [pubkey.substring(0, 6)]),
    ' ',
    cancel,
  ])

  const bodyWrap = h('div', {classList: 'message-body'}, [
    contextDiv,
    textareaDiv,
    previewDiv,
    await imgUpload(textarea)
  ])

  const composerDiv = h('div', [
    meta,
    h('div', {classList: 'message-main'}, [
      h('span', [await avatarSpan()]),
      h('div', {classList: 'message-stack'}, [
        await nameSpan(),
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
