import { h } from 'h'
import { apds } from 'apds'
import { scopeDocument } from './client/runtime/application-context.js'

const openIdentitySetup = (application) => {
  const document = application ? scopeDocument(application.root) : globalThis.document
  const existing = document.getElementById('identity-setup')
  if (existing) { existing.showModal(); return }
  const dialog = h('dialog', { id: 'identity-setup', classList: 'identity-dialog', 'aria-labelledby': 'identity-title' })
  const step = h('p', { classList: 'profile-help' }, ['Step 1 of 3'])
  const title = h('h2', { id: 'identity-title' }, ['Create your identity'])
  const explanation = h('p', ['Your identity is stored in this browser. You can back it up and import it on another device.'])
  const name = h('input', { required: true, maxlength: 100, autocomplete: 'nickname', placeholder: 'How should people know you?' })
  const nameLabel = h('label', { classList: 'profile-field' }, [h('span', ['Display name']), name])
  const status = h('p', { role: 'status', 'aria-live': 'polite' })
  const submit = h('button', { type: 'submit', classList: 'primary-action' }, ['Create identity'])
  const cancel = h('button', { type: 'button', onclick: () => dialog.close() }, ['Cancel'])
  const mode = h('button', { type: 'button' }, ['Import existing identity'])
  const key = h('textarea', { rows: 4, placeholder: 'Paste your identity backup', autocomplete: 'off', spellcheck: false })
  const keyLabel = h('label', { classList: 'profile-field' }, [h('span', ['Identity backup']), key])
  keyLabel.hidden = true
  let importing = false
  let busy = false
  mode.onclick = () => {
    importing = !importing
    step.hidden = importing
    nameLabel.hidden = importing
    name.required = !importing
    keyLabel.hidden = !importing
    key.required = importing
    title.textContent = importing ? 'Import your identity' : 'Create your identity'
    submit.textContent = importing ? 'Import identity' : 'Create identity'
    mode.textContent = importing ? 'Create a new identity instead' : 'Import existing identity'
    status.textContent = ''
    ;(importing ? key : name).focus()
  }
  const form = h('form', { onsubmit: async (event) => {
    event.preventDefault()
    if (busy) return
    busy = true
    submit.disabled = mode.disabled = cancel.disabled = true
    status.textContent = importing ? 'Checking your identity…' : 'Creating your identity…'
    try {
      let keypair
      if (importing) {
        keypair = key.value.trim()
        // Verify that the secret key signs for the public key before storing it.
        const { an } = await import('https://esm.sh/gh/evbogue/anproto@ddc040c/an.js')
        const challenge = await an.hash('Wiredove identity import check')
        const signed = await an.sign(challenge, keypair)
        if (!(await an.open(signed)).endsWith(challenge) || signed.substring(0, 44) !== keypair.substring(0, 44)) throw new Error('Invalid identity backup. Check that you pasted the complete keypair.')
      } else {
        if (!name.value.trim()) { name.focus(); return }
        keypair = await apds.generate()
        await apds.put('name', name.value.trim())
      }
      await apds.put('keypair', keypair)
      const pubkey = await apds.pubkey()
      if (!importing) sessionStorage.setItem('wiredove.setup', pubkey)
      if (application) await application.navigation.navigate(pubkey)
      else window.location.hash = pubkey
      window.location.reload()
    } catch (error) {
      status.textContent = importing ? 'Could not import this backup. Check that you pasted the complete, original keypair.' : 'Could not create your identity. Please try again.'
    } finally {
      busy = false
      submit.disabled = mode.disabled = cancel.disabled = false
    }
  } }, [nameLabel, keyLabel, h('div', { classList: 'profile-actions' }, [submit, cancel]), status, mode])
  dialog.append(step, title, explanation, form)
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault() })
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
  document.body.append(dialog)
  application?.cleanup.push(() => dialog.remove())
  dialog.showModal()
  name.focus()
}

export const identify = async () => {
  const span = h('span')
  if (!await apds.pubkey()) span.append(h('button', { id: 'generate-keypair-button', onclick: () => openIdentitySetup() }, ['Create identity']))
  return span
}

export const promptKeypair = (message = 'Create an identity to post or reply.', application) => {
  openIdentitySetup(application)
}
