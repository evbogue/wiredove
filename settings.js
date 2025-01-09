import { h } from 'h'
import { bogbot } from 'bogbot'
import { nameDiv, avatarSpan } from './profile.js'

const editKey = async () => {
  const textarea = h('textarea', [await bogbot.keypair()])
  const span = h('span', [
    textarea,
    h('button', {
      onclick: async () => {
        const keypair = await bogbot.keypair()
        if (textarea.value.length === keypair.length) {
          await bogbot.put('keypair', textarea.value)
          window.location.hash = '#'
          location.reload()
        } else { alert('Invalid Keypair')}
      }
    }, ['Import key']),
    h('button', {
      onclick: async () => {
        await bogbot.deletekey()
        window.location.hash = '#'
        location.reload()
      }
    }, ['Delete key'])
  ])
  return span
} 

export const settings = async () => {
  const div = h('div', {classList: 'message'}, [
    h('p', ['Upload photo']),
    await avatarSpan(),
    h('hr'),
    h('p', ['New name']),
    await nameDiv(),
    h('hr'),
    h('p', ['Import Keypair']),
    await editKey()
  ])

  return div
}

