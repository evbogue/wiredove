import { createMessageMain, placeMessageMetadata } from './message-layout.js'
// Shared rich edit/history/moderation widgets. All storage and policy mutations
// are explicit adapters; imports do not initialize identity or website services.
export function createMessageControls({ h, document, render, findMessageTarget,
  addHiddenHash, addBlockedAuthor, addMutedAuthor, removeMutedAuthor, removeHiddenHash,
  status = () => {}, refresh, confirmBlock = message => globalThis.confirm(message) }) {
const buildEditSummaryLine = ({ name, editHash, author, nameId, snippet }) => {
  const safeName = name || (author ? author.substring(0, 10) : 'Someone')
  const safeSnippet = snippet || 'message'
  const nameEl = author
    ? h('a', {href: '#' + author, id: nameId, classList: 'avatarlink'}, [safeName])
    : h('span', {id: nameId, classList: 'avatarlink'}, [safeName])
  return h('span', {classList: 'edit-summary'}, [
    nameEl,
    h('span', {classList: 'edit-summary-verb'}, ['edited']),
    h('a', {href: '#' + editHash, classList: 'edit-summary-link'}, [safeSnippet])
  ])
}

const buildEditSummaryRow = ({ avatarLink, summary }) =>
  createMessageMain({ avatarLink, authorNode: summary })

const buildEditMessageShell = ({ id, right, summaryRow, rawDiv, qrTarget }) => {
  placeMessageMetadata(summaryRow, right)
  return h('div', {id, classList: 'message edit-message'}, [
    summaryRow,
    rawDiv,
    qrTarget
  ])
}


const buildEditNav = (hash) => {
  const left = h('a', {
    classList: 'material-symbols-outlined edit-nav-btn',
    onclick: async (e) => {
      e.preventDefault()
      await render.stepEdit(hash, -1)
    }
  }, ['Chevron_Left'])

  const index = h('span', {classList: 'edit-nav-index'}, [''])

  const right = h('a', {
    classList: 'material-symbols-outlined edit-nav-btn',
    onclick: async (e) => {
      e.preventDefault()
      await render.stepEdit(hash, 1)
    }
  }, ['Chevron_Right'])

  const wrap = h('span', {classList: 'edit-nav', style: 'display: none;'}, [
    left,
    index,
    right
  ])

  return { wrap, left, right, index }
}


const applyModerationStub = async ({ target, hash, author, moderation, blob, opened }) => {
  if (!target || !moderation || !moderation.hidden) { return }
  const stub = h('div', {classList: 'message moderation-hidden'})
  const title = h('span', {classList: 'moderation-hidden-title'}, ['Hidden by local moderation'])
  const actions = h('span', {classList: 'moderation-hidden-actions'})
  const showOnce = h('button', {
    onclick: async () => {
      await render.meta(blob, opened, hash, stub, { forceShow: true })
    }
  }, ['Show once'])
  actions.appendChild(showOnce)

  if (moderation.code === 'muted-author') {
    const unmute = h('button', {
      onclick: async () => {
        await removeMutedAuthor(author)
        await render.meta(blob, opened, hash, stub)
      }
    }, ['Unmute'])
    actions.appendChild(unmute)
  } else if (moderation.code === 'hidden-hash') {
    const unhide = h('button', {
      onclick: async () => {
        await removeHiddenHash(hash)
        await render.meta(blob, opened, hash, stub)
      }
    }, ['Unhide'])
    actions.appendChild(unhide)
  } else if (moderation.code === 'muted-word') {
    actions.appendChild(h('a', {href: '#settings'}, ['Edit filters']))
  }

  stub.appendChild(title)
  stub.appendChild(actions)
  target.replaceWith(stub)
}

const buildModerationControls = ({ author, hash, blob, opened }) => {
  const hide = h('a', {
    classList: 'material-symbols-outlined',
    title: 'Hide message',
    onclick: async (e) => {
      e.preventDefault()
      await addHiddenHash(hash)
      const target = findMessageTarget(hash)
      if (target) {
        await applyModerationStub({
          target,
          hash,
          author,
          moderation: { hidden: true, reason: 'Hidden message', code: 'hidden-hash' },
          blob,
          opened
        })
      } else {
        await refresh()
      }
    }
  }, ['Visibility_Off'])

  const block = h('a', {
    classList: 'material-symbols-outlined',
    title: 'Block author',
    onclick: async (e) => {
      e.preventDefault()
      if (!confirmBlock('Block this author and purge their local data?')) { return }
      status('Blocking author…', { sticky: true })
      const result = await addBlockedAuthor(author)
      const removed = result?.purge?.removed ?? 0
      const blobs = result?.purge?.blobs ?? 0
      if (result?.purge) {
        status(`Blocked author. Removed ${removed} post${removed === 1 ? '' : 's'}, ${blobs} blob${blobs === 1 ? '' : 's'}.`)
      } else {
        status('Blocked author.')
      }
      const wrappers = Array.from(document.querySelectorAll('.message-wrapper'))
        .filter(node => node.dataset?.author === author)
      if (wrappers.length) {
        wrappers.forEach(node => node.remove())
      } else {
        const wrapper = document.getElementById(hash)
        if (wrapper) {
          wrapper.remove()
        } else {
          await refresh()
        }
      }
    }
  }, ['Block'])

  const mute = h('a', {
    classList: 'material-symbols-outlined',
    title: 'Mute author',
    onclick: async (e) => {
      e.preventDefault()
      await addMutedAuthor(author)
      const target = findMessageTarget(hash)
      if (target) {
        await applyModerationStub({
          target,
          hash,
          author,
          moderation: { hidden: true, reason: 'Muted author', code: 'muted-author' },
          blob,
          opened
        })
      } else {
        await refresh()
      }
    }
  }, ['Person_Off'])

  return h('span', {classList: 'message-actions-mod'}, [hide, mute, block])
}


return { buildEditSummaryLine, buildEditSummaryRow, buildEditMessageShell,
  buildEditNav, applyModerationStub, buildModerationControls }
}
