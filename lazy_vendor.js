const HLJS_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
const HLJS_STYLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/nord.min.css'
const QRIOUS_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js'

let hljsPromise = null
let qriousPromise = null
let hljsStylePromise = null

const loadScript = (src) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[data-src="${src}"]`)
  if (existing) {
    if (existing.dataset.loaded === 'true') {
      resolve()
    } else {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load script: ' + src)), { once: true })
    }
    return
  }
  const script = document.createElement('script')
  script.src = src
  script.async = true
  script.dataset.src = src
  script.addEventListener('load', () => {
    script.dataset.loaded = 'true'
    resolve()
  }, { once: true })
  script.addEventListener('error', () => reject(new Error('Failed to load script: ' + src)), { once: true })
  document.head.appendChild(script)
})

const loadStylesheet = (href) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`)
  if (existing) {
    resolve()
    return
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.addEventListener('load', () => resolve(), { once: true })
  link.addEventListener('error', () => reject(new Error('Failed to load stylesheet: ' + href)), { once: true })
  document.head.appendChild(link)
})

export const ensureHighlight = async () => {
  if (!hljsStylePromise) {
    hljsStylePromise = loadStylesheet(HLJS_STYLE_URL).catch((err) => {
      hljsStylePromise = null
      throw err
    })
  }
  if (!hljsPromise) {
    hljsPromise = loadScript(HLJS_SCRIPT_URL).then(() => window.hljs).catch((err) => {
      hljsPromise = null
      throw err
    })
  }
  await hljsStylePromise
  const hljs = await hljsPromise
  return hljs
}

export const ensureQRious = async () => {
  if (!qriousPromise) {
    qriousPromise = loadScript(QRIOUS_SCRIPT_URL).then(() => window.QRious).catch((err) => {
      qriousPromise = null
      throw err
    })
  }
  const QRious = await qriousPromise
  return QRious
}
