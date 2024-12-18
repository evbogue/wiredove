import { bogbot } from 'bogbot'
import { render } from './render.js'
import { blast } from './gossip.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 

export const composer = async () => {
  const div = h('div', {classList: 'message'}, [
    await avatarSpan(),
    await nameSpan()
  ])

  const ta = h('textarea', {placeholder: 'Write a message'})
  
  div.appendChild(ta)
  
  const b = document.createElement('button')
  
  b.textContent = 'Sign'
  
  b.onclick = async () => {
    const published = await bogbot.compose(ta.value)
    ta.value = ''
    const scroller = document.getElementById('scroller')
    await render.hash(published, scroller)
    const signed = await bogbot.find(published)
    await blast(signed)
  }
  
  div.appendChild(b)

  return div
}
