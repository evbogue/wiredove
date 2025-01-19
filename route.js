import { bogbot } from 'bogbot'
import { render } from './render.js'
import { h } from 'h'
import { composer } from './composer.js'
import { profile } from './profile.js'
import { makeRoom, gossip } from './gossip.js'
import { settings } from './settings.js'

export const route = async () => {
  if (!window.location.hash) { window.location = '#'}
  const src = window.location.hash.substring(1)
  const scroller = h('div', {id: 'scroller'})

  document.body.appendChild(scroller)

  if (src === '') {
    const controls = h('div', {id: 'controls'})
    document.body.insertBefore(controls, scroller)
    controls.appendChild(await composer()) 
    const log = await bogbot.query()
    if (log) {
      log.forEach(async (msg) => {
        const div = await render.hash(msg.hash)
        scroller.insertBefore(div, scroller.firstChild)
      })
    }
  }

  if (src === 'settings') {
    scroller.appendChild(await settings())
  }

  if (src.length === 44) {
    try {
      let got = false
      const log = await bogbot.query(src)
      if (log) {
        log.forEach(async (msg) => {
          got = true
          const div = await render.hash(msg.hash, scroller)
          scroller.insertBefore(div, scroller.firstChild)
        })
      }
      if (!got) { await gossip(src)}
    } catch (err) { console.log(err)}
  } if (src.length > 44) {
    const hash = await bogbot.hash(src)
    const opened = await bogbot.open(src)
    if (opened) {
      await makeRoom(src.substring(0, 44))
      await bogbot.add(src)
    }
    const check = await document.getElementById(hash)
    if (!check) {
      const div = h('div', {id: hash, classList: 'message'})
      scroller.appendChild(div)
      await render.blob(src)  
    }
  }
}

window.onhashchange = async () => {
  const scroller = document.getElementById('scroller')
  const controls = document.getElementById('controls')
  if (scroller) { scroller.parentNode.removeChild(scroller) }
  if (controls) { controls.parentNode.removeChild(controls) }
  await route()
}

