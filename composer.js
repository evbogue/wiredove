import { bogbot } from 'bogbot'
import { render } from './render.js'

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
  }
  
  div.appendChild(b)

  return div
}
