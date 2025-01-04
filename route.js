import {bogbot} from 'bogbot'
import { render } from './render.js'
import {h} from 'h'
import { composer } from './composer.js'
import { profile } from './profile.js'
import { makeRoom, gossip } from './gossip.js'

export const route = async () => {
  if (!window.location.hash) { window.location = '#'}
  const src = window.location.hash.substring(1)
  const scroller = h('div', {id: 'scroller'})

  document.body.appendChild(scroller)
  //scroller.appendChild(h('div', [src]))
  if (src === '') {
    const controls = h('div', {id: 'controls'})
    document.body.insertBefore(controls, scroller)
    controls.appendChild(await composer()) 
    const log = await bogbot.getLog()
    log.forEach(async (hash) => {
      await render.hash(hash, scroller)
    })
  }

  if (src.length === 44) {
    console.log(src)
    try {
      let got = false
      const log = await bogbot.getLog()
      log.forEach(async (hash) => {
        const found = await bogbot.get(hash)
        const author = found.substring(0, 44)
        const posthash = await bogbot.hash(found)
        
        if (posthash === src || author === src) {
          got = true 
          await render.hash(hash, scroller)
        }
      })
      if (!got) { await gossip(src)}
    } catch (err) {}
  } if (src.length > 44) {
    const hash = await bogbot.hash(src)
    const opened = await bogbot.open(src)
    if (opened) {
      await makeRoom(src.substring(0, 44))
    }
    const check = document.getElementById(hash)
    if (!check) {
      const div = h('div', {id: hash}, [])
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

