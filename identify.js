import {h} from 'h'
import {bogbot} from 'bogbot'

const nameDiv = async () => {
  const name = await bogbot.get('name')

  const namer = h('input', {
    placeholder: name || 'Name yourself'
  })

  const namerDiv = h('span', [
    namer,
    h('button', {onclick: async () => {
      if (namer.value) {
        namer.placeholder = namer.value
        await bogbot.put('name', namer.value)
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
      await bogbot.put('keypair', keypair)
      document.location.reload()
    }
  }, ['Save'])

  return button
} 

export const genDiv = async () => {
  const initial = await bogbot.generate()
  const name = await bogbot.get('name')
  const pubkey = h('span', {classList: 'pubkey'})
  const button = h('button', {
    onclick: async () => {
      if (name.length > 1) {
        const alreadyButton = document.getElementById('saveButton')
        if (alreadyButton) { alreadyButton.remove() }
        let done = true
        const genInterval = setInterval(async _ => {
          const keypair = await bogbot.generate()
          pubkey.textContent = keypair.substring(0, 10)
          if (keypair.substring(0, 2).toUpperCase() === name.substring(0, 2).toUpperCase()) {
            clearInterval(genInterval)
            pubkey.after(await saveButton(keypair))
          }
        }, .000001)
      } else {
        await bogbot.put('keypair', initial)
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
    onclick: async () => {
      const div2 = h('span', [
        await nameDiv()
      ])

      div1.replaceWith(div2)
    }
  }, ['Generate Keypair'])

  const div1 = h('span', [start])


  if (!await bogbot.pubkey()) {
    span.appendChild(div1)    
  }
  return span
}
