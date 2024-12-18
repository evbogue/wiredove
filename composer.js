import { bogbot } from 'bogbot'
import { render } from './render.js'
import { blast } from './gossip.js'

export const composer = async () => {
  const div = document.createElement('div')
  const ta = document.createElement('textarea')
  
  ta.placeholder = 'Write a message'
  
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
