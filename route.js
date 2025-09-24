import { apds } from 'apds'
import { render } from './render.js'
import { h } from 'h'
import { composer } from './composer.js'
import { profile } from './profile.js'
import { makeRoom } from './gossip.js'
import { settings, importKey } from './settings.js'
import { adder } from './adder.js'
import { importBlob } from './import.js'
import { send } from './send.js'

export const route = async () => {
  const src = window.location.hash.substring(1)
  const scroller = h('div', {id: 'scroller'})

  document.body.appendChild(scroller)

  if (src === '') {
    const log = await apds.query()
    const newlog = []
    if (log) {
      for (const msg of log) {
        if (!await apds.get('archived' + msg.hash)) {
          newlog.push(msg)
        }
      }
      adder(newlog, src, scroller)
    }
  }

  else if (src === 'archive') {
    const log = await apds.query()
    if (log) {
      const newlog = []
      for (const msg of log) {
        if (await apds.get('archived' + msg.hash)) {
          newlog.push(msg)
        }
      }
      adder(newlog, src, scroller)
    }
    //if (log) {
    //  log.forEach(async (msg) => {
    //      const div = await render.hash(msg.hash)
    //      await scroller.insertBefore(div, scroller.firstChild)
    //      const sig = await apds.get(msg.hash)
    //      if (sig) { await render.blob(sig)}
    //    }
    //  })
    //}
  } 

  else if (src === 'settings') {
    if (await apds.pubkey()) {
      scroller.appendChild(await settings())
    } else {
      scroller.appendChild(await importKey())
    }
  }

  else if (src === 'import') {
    scroller.appendChild(await importBlob())
  }

  else if (src.length < 44 & !src.startsWith('?')) {
    try {
      const ar = await fetch('https://pub.wiredove.net/' + src).then(r => r.json())
      if (ar) { localStorage.setItem(src, JSON.stringify(ar))}
      console.log(ar)
      let query = []
      for (const pubkey of ar) {
        await send(pubkey)
        const q = await apds.query(pubkey)
        if (q) {
          query.push(...q)
        }
      }
      await query.sort((a, b) => a.ts - b.ts)
      //console.log(query)
      adder(query, src, scroller)
    } catch (err) {console.log(err)}
  } 

  else if (src.length === 44) {
    try {
      const log = await apds.query(src)
      if (log && log[0]) {
        adder(log, src, scroller)
      } else {
        console.log('we do not have it')
        await send(src) 
      }
    } catch (err) { console.log(err)}
  } 
  else if (src.startsWith('?')) {
    try {
      const log = await apds.query(src)
      if (log && log[0] && log != '') {
        adder(log, src, scroller)
      }
    } catch (err) {}
  }
  else if (src.length > 44) {
    const hash = await apds.hash(src)
    const opened = await apds.open(src)
    if (opened) {
      await makeRoom(src.substring(0, 44))
      await apds.add(src)
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
}

window.onhashchange = async () => {
  while (document.getElementById('scroller')) {
    document.getElementById('scroller').remove()
  }
  if (window.location.hash === '#?') {
    const search = document.getElementById('search')
    search.value = ''
    search.classList = 'material-symbols-outlined'
    window.location.hash = ''
  }
  await route()
}

