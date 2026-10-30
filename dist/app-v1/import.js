import { h } from 'https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'

export const importBlob = async (navigation) => {
  const textarea = h('textarea', {placeholder: 'Import a bog5 message or blob'})

  const button = h('button', {
    onclick: async () => {
      if (textarea.value) {
        try {
          const blob = await apds.make(textarea.value)
          const msg = await apds.open(textarea.value)
          const hash = await apds.hash(textarea.value)
          if (navigation) await navigation.navigate(hash)
          else window.location.hash = hash
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
