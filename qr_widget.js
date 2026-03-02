import { h } from 'h'
import { ensureQRious } from './lazy_vendor.js'

export const buildQR = (hash, blob, target) => {
  const link = h('a', {
    onclick: async () => {
      const qrTarget = target || document.getElementById('qr-target' + hash)
      if (!qrTarget) { return }
      if (!qrTarget.firstChild) {
        const canvas = document.createElement('canvas')
        qrTarget.appendChild(canvas)
        const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        const background = darkMode ? '#222' : '#f8f8f8'
        const foreground = darkMode ? '#ccc' : '#444'
        const maxSize = Math.min(
          400,
          Math.floor(window.innerWidth * 0.9),
          Math.floor(window.innerHeight * 0.6)
        )
        const size = Math.max(160, maxSize)
        try {
          const QRious = await ensureQRious()
          new QRious({
            element: canvas,
            value: location.href + blob,
            size,
            background,
            foreground,
          })
        } catch (err) {
          console.warn('QRious load failed', err)
          while (qrTarget.firstChild) {
            qrTarget.firstChild.remove()
          }
        }
      } else {
        while (qrTarget.firstChild) {
          qrTarget.firstChild.remove()
        }
      }
    },
    classList: 'material-symbols-outlined'
  }, ['Qr_Code'])

  return link
}
