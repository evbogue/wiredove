import { render } from './render.js'
import { apds } from 'apds'

const addPosts = async (posts, div) => {
  for (const post of posts) {
    const ts = post.ts || (post.opened ? Number.parseInt(post.opened.substring(0, 13), 10) : 0)
    let placeholder = render.hash(post.hash)
    if (!placeholder) {
      placeholder = document.getElementById(post.hash)
    }
    if (!placeholder) { continue }
    if (ts) { placeholder.dataset.ts = ts.toString() }
    if (placeholder.parentNode !== div) {
      div.appendChild(placeholder)
    }
    setTimeout(async () => {
      const sig = await apds.get(post.hash)
      await render.blob(sig)
    }, 1)
  }
}

const getTimestamp = (post) => {
  if (!post) { return 0 }
  if (post.ts) { return Number.parseInt(post.ts, 10) }
  if (post.opened) { return Number.parseInt(post.opened.substring(0, 13), 10) }
  return 0
}

const isAscending = (log) => {
  if (!log || log.length < 2) { return false }
  let left = 0
  let right = 0
  for (const post of log) {
    left = getTimestamp(post)
    if (left) { break }
  }
  for (let i = log.length - 1; i >= 0; i--) {
    right = getTimestamp(log[i])
    if (right) { break }
  }
  return left && right ? left < right : false
}

export const adder = (log, src, div) => {
  if (log && log[0]) {
    let index = 0
    const ascending = isAscending(log)

    let posts = []
    if (ascending) {
      const end = log.length - index
      const start = Math.max(0, end - 25)
      posts = log.slice(start, end).reverse()
    } else {
      posts = log.slice(index, index + 25)
    }

    addPosts(posts, div)
    index = index + 25

    window.onscroll = () => {
      if (((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 1000) && window.location.hash.substring(1) === src) {
        if (ascending) {
          const end = log.length - index
          const start = Math.max(0, end - 25)
          posts = log.slice(start, end).reverse()
        } else {
          posts = log.slice(index, index + 25)
        }
        index = index + 25
        addPosts(posts, div)
      }
    }
  }
}
