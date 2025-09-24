import { h } from 'h'
import { apds } from 'apds'

export const importBlob = async () => {
  const textarea = h('textarea', {placeholder: 'Import a bog5 message or blob'})

  const button = h('button', {
    onclick: async () => {
      if (textarea.value) {
        try {
          const blob = await apds.make(textarea.value)
          const msg = await apds.open(textarea.value)
          window.location.hash = await apds.hash(textarea.value)
          if (msg) {
            await apds.add(textarea.value)
          }
        } catch (err) {
        }
      }
    }
  }, ['Import'])

  return h('div', {classList: 'message'}, [
    textarea,
    button
  ])
}
