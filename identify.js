import {h} from 'h'
import {bogbot} from 'bogbot'

const nameDiv = async () => {
  const name = await localStorage.getItem('name')

  const namer = h('input', {
    placeholder: name || 'Name yourself'
  })

  const namerDiv = h('div', [
    namer,
    h('button', {onclick: async () => {
      if (namer.value) {
        namer.placeholder = namer.value
        localStorage.setItem('name', namer.value)
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
      await localStorage.setItem('keypair', keypair)
      document.location.reload()
    }
  }, ['Save keypair'])

  return button
} 

const genDiv = async () => {
  const initial = await bogbot.generate()
  const name = await localStorage.getItem('name')
  const pubkey = h('span', {style: "background-image: linear-gradient(to right, #65d7ed, #f92772); background-clip: text; color: transparent;"})
  const button = h('button', {
    onclick: async () => {
      const alreadyButton = document.getElementById('saveButton')
      if (alreadyButton) { alreadyButton.remove() }
      let done = true
      const genInterval = setInterval(async _ => {
        const keypair = await bogbot.generate()
        pubkey.textContent = keypair.substring(0, 44)
        if (keypair.substring(0, 2).toUpperCase() === name.substring(0, 2).toUpperCase()) {
          clearInterval(genInterval)
          button.after(await saveButton(keypair))
        }
      }, .000001)
    }
  }, ['Generate'])
  button.click()
  const div = h('div', [
    h('span', [name]),
    ' ',
    pubkey,
    ' ',
    h('br'),
    button
  ])
  return div
}

export const identify = async () => {
  const start = h('button', {
    onclick: async () => {
      const div2 = h('div', [
        await nameDiv()
      ])

      div1.replaceWith(div2)
    }
  }, ['Get started'])
  const div1 = h('div', ['You have not generated a keypair. ', start])

  const name = h('name')
 

  document.body.appendChild(div1)
}
