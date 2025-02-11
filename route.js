import { bogbot } from 'bogbot'
import { render } from './render.js'
import { h } from 'h'
import { composer } from './composer.js'
import { profile } from './profile.js'
import { makeRoom, gossip } from './gossip.js'
import { settings, importKey } from './settings.js'

export const route = async () => {
  const src = window.location.hash.substring(1)
  const scroller = h('div', {id: 'scroller'})

  document.body.appendChild(scroller)

  if (src === '') {
    const log = await bogbot.query()
    if (log) {
      log.forEach(async (msg) => {
        if (!await bogbot.get('archived' + msg.hash)) {
          const div = await render.hash(msg.hash)
          scroller.insertBefore(div, scroller.firstChild)
          const sig = await bogbot.get(msg.hash)
          if (sig) { await render.blob(sig)}
        }
      })
    }
    if (await bogbot.pubkey()) {
      scroller.insertBefore(await composer(), scroller.firstChild) 
    }
  }

  if (src === 'settings') {
    if (await bogbot.pubkey()) {
      scroller.appendChild(await settings())
    } else {
      scroller.appendChild(await importKey())
    }
  }

  if (src.length === 44) {
    try {
      let got = false
      const log = await bogbot.query(src)
      if (log) {
        log.forEach(async (msg) => {
          got = true
          const div = await render.hash(msg.hash, scroller)
          if (div) {
            scroller.insertBefore(div, scroller.firstChild)
            const sig = await bogbot.get(msg.hash)
            if (sig) { await render.blob(sig)}
          }
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
  setTimeout(() => {
    hljs.highlightAll()
  }, 100)
  //const codes = document.getElementsByTagName('code')
  //for (let i = 0; i < codes.length; i++) {
  //  hljs.highlightBlock(codes[i])
  //}
  //const pres = document.getElementsByTagName('pre')
  //for (let i = 0; i < pres.length; i++) {
  //  hljs.highlightBlock(pres[i])
  //}

}

window.onhashchange = async () => {
  while (document.getElementById('scroller')) {
    document.getElementById('scroller').remove()
  }
  await route()
}

