import { bogbot } from 'bogbot'
import { render } from './render.js'
import { blast } from './gossip.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 

export const composer = async () => {
  const textarea = h('textarea', {placeholder: 'Write a message'})

  const button = h('a', {classList: 'material-symbols-outlined', style: 'float: right;', onclick: async () => {
    const published = await bogbot.compose(textarea.value)
    textarea.value = ''
    const scroller = document.getElementById('scroller')
    await render.hash(published, scroller)
    const signed = await bogbot.find(published)
    await blast(signed)
  }}, ['Send'])

  const pubkey = await bogbot.pubkey()

  const textareaDiv = h('div', {style: 'margin-left: 57px;'}, [
    textarea,
    h('div', [
      h('a', {classList: 'material-symbols-outlined', onclick: () => {
          div.parentNode.removeChild(div)
        }
      }, ['Cancel']),
      button
    ])
  ])

  const div = h('div', {classList: 'message'}, [
    h('span', {classList: 'pubkey', style: 'float: right;'}, [pubkey.substring(0, 10)]),
    await avatarSpan(),
    await nameSpan(),
    textareaDiv,
  ])

  return div
}
