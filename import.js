import { h } from 'h'
import { bogbot } from 'bogbot'

export const importBlob = async () => {
  const textarea = h('textarea', {placeholder: 'Import a bog5 message or blob'})

  const button = h('button', {
    onclick: async () => {
      if (textarea.value) {
        try {
          const blob = await bogbot.make(textarea.value)
          const msg = await bogbot.open(textarea.value)
          window.location.hash = await bogbot.hash(textarea.value)
          if (msg) {
            await bogbot.add(textarea.value)
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
