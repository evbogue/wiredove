import { bogbot } from 'bogbot'
import { render } from './render.js'
import { blast } from './gossip.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 

export const composer = async () => {
  const textarea = h('textarea', {placeholder: 'Write a message'})

  const button = h('button', {onclick: async () => {
    const published = await bogbot.compose(textarea.value)
    textarea.value = ''
    const scroller = document.getElementById('scroller')
    await render.hash(published, scroller)
    const signed = await bogbot.find(published)
    await blast(signed)
  }}, ['Send'])

  const div = h('div', {classList: 'message'}, [
    await avatarSpan(),
    await nameSpan(),
    h('div', {classList: 'pubkey'}, [await bogbot.pubkey()]),
    textarea,
    button
  ])

  return div
}
