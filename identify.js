import {h} from 'h'
import {apds} from 'apds'

export const identify = async () => {
  const span = h('span')

  const start = h('button', {
    id: 'generate-keypair-button',
    onclick: async () => {
      start.disabled = true
      start.textContent = 'Generating...'
      const keypair = await apds.generate()
      await apds.put('keypair', keypair)
      window.dispatchEvent(new CustomEvent('keypair-created'))
    }
  }, ['Generate Keypair'])

  const div1 = h('span', [start])

  if (!await apds.pubkey()) {
    span.appendChild(div1)
  }
  return span
}

export const vanityKeygen = () => {
  const prefix = h('input', { placeholder: 'Prefix (e.g. "ev")' })
  const status = h('span', { classList: 'vanity-status' })
  let running = false
  let genInterval = null

  const stop = h('button', {
    style: 'display: none;',
    onclick: () => {
      if (genInterval) { clearInterval(genInterval) }
      running = false
      stop.style.display = 'none'
      searchBtn.style.display = ''
    }
  }, ['Stop'])

  const searchBtn = h('button', {
    onclick: async () => {
      const target = prefix.value.trim()
      if (!target) { return }
      running = true
      searchBtn.style.display = 'none'
      stop.style.display = ''
      let attempts = 0
      genInterval = setInterval(async () => {
        if (!running) { return }
        const keypair = await apds.generate()
        attempts++
        const pub = keypair.substring(0, target.length)
        if (pub.toUpperCase() === target.toUpperCase()) {
          clearInterval(genInterval)
          running = false
          stop.style.display = 'none'
          searchBtn.style.display = ''
          status.textContent = `Match found after ${attempts} attempts`
          const save = h('button', {
            onclick: async () => {
              await apds.put('keypair', keypair)
              window.location.hash = '#'
              document.location.reload()
            }
          }, ['Use this key'])
          result.replaceChildren(
            h('span', { classList: 'pubkey' }, [keypair.substring(0, 10) + '...']),
            ' ',
            save
          )
        } else {
          status.textContent = `${attempts} keys checked...`
        }
      }, 1)
    }
  }, ['Search'])

  const result = h('div')

  return h('div', { classList: 'vanity-keygen' }, [
    h('p', ['Generate a keypair whose public key starts with a specific prefix.']),
    h('div', [prefix, ' ', searchBtn, stop]),
    status,
    result
  ])
}

export const promptKeypair = (message = 'Generate a keypair to post or reply.') => {
  const button = document.getElementById('generate-keypair-button')
  if (button) {
    button.classList.add('keypair-highlight')
    button.focus?.()
    setTimeout(() => {
      button.classList.remove('keypair-highlight')
    }, 1800)
  }

  const existing = document.getElementById('keypair-notice')
  const notice = existing || h('div', {id: 'keypair-notice', classList: 'keypair-notice'}, [''])
  notice.textContent = message
  notice.classList.add('show')

  if (!existing) {
    const navbar = document.getElementById('navbar')
    if (navbar && navbar.parentNode) {
      navbar.parentNode.insertBefore(notice, navbar.nextSibling)
    } else {
      document.body.appendChild(notice)
    }
  }

  setTimeout(() => {
    notice.classList.remove('show')
  }, 3000)
}
