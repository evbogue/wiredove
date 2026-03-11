import { h } from 'h'
import { apds } from 'apds'
import { render } from './render.js'
import { identify } from './identify.js'
import { getRemoteApdsBase } from './bootstrap_config.js'
import { getBootstrapConfig } from './bootstrap_config.js'

const FEATURED_PUBKEY = getBootstrapConfig().seed
const MAX_POSTS = 10

const rankPosts = async (messages) => {
  const replyCounts = new Map()
  const posts = []

  for (const m of messages) {
    if (!m || !m.sig || !m.text) { continue }
    let yaml
    try { yaml = await apds.parseYaml(m.text) } catch { continue }
    if (!yaml) { continue }

    if (yaml.reply) {
      replyCounts.set(yaml.reply, (replyCounts.get(yaml.reply) || 0) + 1)
    }

    if (yaml.reply || yaml.edit) { continue }

    let ts = 0
    try {
      const opened = await apds.open(m.sig)
      if (opened && opened.length >= 13) {
        ts = Number.parseInt(opened.substring(0, 13), 10) || 0
      }
    } catch {}

    const author = m.sig.substring(0, 44)
    const hash = await apds.hash(m.sig)
    posts.push({ sig: m.sig, text: m.text, hash, author, ts, yaml })
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

export const welcomePanel = async () => {
  const container = h('div', { classList: 'welcome-container' })

  const card = h('div', { classList: 'message welcome-card' }, [
    h('h2', ['Wiredove']),
    h('p', ['A distributed social network. Your identity is a cryptographic keypair that lives in your browser \u2014 no accounts, no servers, no one in control.']),
    await identify()
  ])
  container.appendChild(card)

  // Fetch and render trending posts
  try {
    const url = new URL('/all', getRemoteApdsBase()).toString()
    const res = await fetch(url)
    if (!res.ok) { return container }
    const messages = await res.json()
    if (!Array.isArray(messages) || !messages.length) { return container }

    const ranked = await rankPosts(messages)
    if (!ranked.length) { return container }

    container.appendChild(h('p', { style: 'color: #777; margin-top: 16px; margin-bottom: 4px;' }, ['Recent posts']))

    const scroller = h('div', { classList: 'welcome-posts' })
    container.appendChild(scroller)

    for (const post of ranked) {
      await apds.add(post.sig)
      await apds.make(post.text)
      const opened = await apds.open(post.sig)
      const ts = opened ? opened.substring(0, 13) : String(post.ts)
      const placeholder = render.insertByTimestamp(scroller, post.hash, ts)
      if (placeholder) {
        if (opened) { placeholder.dataset.opened = opened }
        await render.blob(post.sig, { hash: post.hash, opened })
      }
    }
  } catch (err) {
    console.warn('welcome: failed to load recent posts', err)
  }

  return container
}
