import {h} from 'h'
import {apds} from 'apds'

const nameDiv = async () => {
  const name = await apds.get('name')

  const namer = h('input', {
    placeholder: name || 'Name yourself'
  })

  const namerDiv = h('span', [
    namer,
    h('button', {onclick: async () => {
      if (namer.value) {
        namer.placeholder = namer.value
        await apds.put('name', namer.value)
        namer.value = ''
        namerDiv.replaceWith(await genDiv())
      }
    }}, ['Save'])
  ])

  return namerDiv
}

const saveButton = async (keypair) => {
  const button = h('button', {
    id: 'saveButton',
    onclick: async () => {
      await apds.put('keypair', keypair)
      document.location.reload()
    }
  }, ['Save'])

  return button
} 

export const genDiv = async () => {
  const initial = await apds.generate()
  const name = await apds.get('name')
  const pubkey = h('span', {classList: 'pubkey'})
  const button = h('button', {
    onclick: async () => {
      if (name.length > 1) {
        const alreadyButton = document.getElementById('saveButton')
        if (alreadyButton) { alreadyButton.remove() }
        let done = true
        const genInterval = setInterval(async _ => {
          const keypair = await apds.generate()
          pubkey.textContent = keypair.substring(0, 10)
          if (keypair.substring(0, 2).toUpperCase() === name.substring(0, 2).toUpperCase()) {
            clearInterval(genInterval)
            pubkey.after(await saveButton(keypair))
          }
        }, .000001)
      } else {
        await apds.put('keypair', initial)
        document.location.reload()
      }
    }
  }, ['Generate'])
  button.click()
  const div = h('span', [
    h('span', [name]),
    button,
    ' ',
    pubkey,
    ' ',
  ])
  return div
}

export const identify = async () => {
  const span = h('span')

  const start = h('button', {
    id: 'generate-keypair-button',
    onclick: async () => {
      const div2 = h('span', [
        await nameDiv()
      ])

      div1.replaceWith(div2)
    }
  }, ['Generate Keypair'])

  const div1 = h('span', [start])


  if (!await apds.pubkey()) {
    span.appendChild(div1)    
  }
  return span
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
