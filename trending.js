import { h } from 'h'
import { apds } from 'apds'
import { render } from './render.js'
import { identify } from './identify.js'
import { getRemoteApdsBase, getBootstrapConfig } from './bootstrap_config.js'

const FEATURED_PUBKEY = getBootstrapConfig().seed
const MAX_POSTS = 10

const isSigned = (msg) => typeof msg === 'string' && msg.length > 44

const fetchAndStoreMessages = async () => {
  const url = new URL('/gossip/poll', getRemoteApdsBase())
  url.searchParams.set('since', '0')
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) { return [] }
  const data = await res.json()
  const messages = Array.isArray(data.messages) ? data.messages : []

  // Store everything — apds links signed messages to their content blobs
  for (const msg of messages) {
    if (typeof msg !== 'string') { continue }
    await apds.make(msg)
    if (isSigned(msg)) {
      await apds.add(msg)
    }
  }

  return messages
}

const rankPosts = async (messages) => {
  const replyCounts = new Map()
  const posts = []

  for (const msg of messages) {
    if (!isSigned(msg)) { continue }

    const opened = await apds.open(msg)
    if (!opened) { continue }

    const contentHash = opened.substring(13)
    const content = await apds.get(contentHash)
    if (!content) { continue }

    let yaml
    try { yaml = await apds.parseYaml(content) } catch { continue }
    if (!yaml) { continue }

    const hash = await apds.hash(msg)

    if (yaml.reply) {
      replyCounts.set(yaml.reply, (replyCounts.get(yaml.reply) || 0) + 1)
    }

    if (yaml.reply || yaml.edit) { continue }

    const ts = Number.parseInt(opened.substring(0, 13), 10) || 0
    const author = msg.substring(0, 44)
    posts.push({ sig: msg, hash, author, ts, opened })
  }

  const now = Date.now()
  const DAY_MS = 86400000
  const scored = posts.map(p => {
    const replies = replyCounts.get(p.hash) || 0
    const ageMs = Math.max(0, now - p.ts)
    const ageDays = ageMs / DAY_MS
    const recency = Math.max(0, 1 - ageDays / 30)
    const score = replies * 1000 + recency * 100
    return { ...p, score, replies }
  })

  scored.sort((a, b) => b.score - a.score)

  // Pin featured pubkey's latest post at top if not already there
  const featured = scored.find(p => p.author === FEATURED_PUBKEY)
  const topIsFeatured = scored[0] && scored[0].author === FEATURED_PUBKEY
  if (featured && !topIsFeatured) {
    const idx = scored.indexOf(featured)
    scored.splice(idx, 1)
    scored.unshift(featured)
  }

  return scored.slice(0, MAX_POSTS)
}

export const onboardingCard = async () => {
  const card = h('div', { classList: 'message welcome-card' }, [
    h('h2', ['Wiredove']),
    h('p', ['A distributed social network. Your identity is a cryptographic keypair that lives in your browser \u2014 no accounts, no servers, no one in control.']),
    await identify()
  ])

  window.addEventListener('keypair-created', () => {
    const btn = card.querySelector('#generate-keypair-button')
    if (btn) { btn.closest('span').remove() }
  }, { once: true })

  return card
}

export const trendingPanel = async (container) => {
  try {
    const messages = await fetchAndStoreMessages()
    if (!messages.length) { return }

    const ranked = await rankPosts(messages)
    if (!ranked.length) { return }

    const scroller = h('div', { classList: 'trending-posts' })
    container.appendChild(scroller)

    for (const post of ranked) {
      const ts = post.opened ? post.opened.substring(0, 13) : String(post.ts)
      const placeholder = render.insertByTimestamp(scroller, post.hash, ts)
      if (placeholder) {
        if (post.opened) { placeholder.dataset.opened = post.opened }
        await render.blob(post.sig, { hash: post.hash, opened: post.opened })
      }
    }
  } catch (err) {
    console.warn('trending: failed to load posts', err)
  }
}
