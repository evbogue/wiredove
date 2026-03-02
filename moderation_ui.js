import { h } from 'h'
import { addBlockedAuthor, addHiddenHash, addMutedAuthor, removeHiddenHash, removeMutedAuthor } from './moderation.js'

// Late-bound reference to the render object, set via initModerationUI()
let render = null

export const initModerationUI = (renderObj) => {
  render = renderObj
}

export const findMessageTarget = (hash) => {
  if (!hash) { return null }
  const wrapper = document.getElementById(hash)
  if (!wrapper) { return null }
  return wrapper.querySelector('.message') || wrapper.querySelector('.message-shell')
}

export const applyModerationStub = async ({ target, hash, author, moderation, blob, opened }) => {
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
    actions.appendChild(h('button', {
      onclick: async () => {
        await removeMutedAuthor(author)
        await render.meta(blob, opened, hash, stub)
      }
    }, ['Unmute']))
  } else if (moderation.code === 'hidden-hash') {
    actions.appendChild(h('button', {
      onclick: async () => {
        await removeHiddenHash(hash)
        await render.meta(blob, opened, hash, stub)
      }
    }, ['Unhide']))
  } else if (moderation.code === 'muted-word') {
    actions.appendChild(h('a', {href: '#settings'}, ['Edit filters']))
  }

  stub.appendChild(title)
  stub.appendChild(actions)
  target.replaceWith(stub)
}

const makeModerationAction = ({ icon, title, onclick }) => {
  return h('a', {
    classList: 'material-symbols-outlined',
    title,
    onclick: async (e) => {
      e.preventDefault()
      await onclick()
    }
  }, [icon])
}

export const buildModerationControls = ({ author, hash, blob, opened }) => {
  const stubAfterAction = async (code, reason) => {
    const target = findMessageTarget(hash)
    if (target) {
      await applyModerationStub({
        target, hash, author,
        moderation: { hidden: true, reason, code },
        blob, opened
      })
    } else {
      location.reload()
    }
  }

  const hide = makeModerationAction({
    icon: 'Visibility_Off',
    title: 'Hide message',
    onclick: async () => {
      await addHiddenHash(hash)
      await stubAfterAction('hidden-hash', 'Hidden message')
    }
  })

  const mute = makeModerationAction({
    icon: 'Person_Off',
    title: 'Mute author',
    onclick: async () => {
      await addMutedAuthor(author)
      await stubAfterAction('muted-author', 'Muted author')
    }
  })

  const block = makeModerationAction({
    icon: 'Block',
    title: 'Block author',
    onclick: async () => {
      if (!confirm('Block this author and purge their local data?')) { return }
      window.__feedStatus?.('Blocking author…', { sticky: true })
      const result = await addBlockedAuthor(author)
      const removed = result?.purge?.removed ?? 0
      const blobs = result?.purge?.blobs ?? 0
      if (result?.purge) {
        window.__feedStatus?.(`Blocked author. Removed ${removed} post${removed === 1 ? '' : 's'}, ${blobs} blob${blobs === 1 ? '' : 's'}.`)
      } else {
        window.__feedStatus?.('Blocked author.')
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
          location.reload()
        }
      }
    }
  })

  return h('span', {classList: 'message-actions-mod'}, [hide, mute, block])
}
