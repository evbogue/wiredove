import { render } from './render.js'
import { apds } from 'apds'

const addPosts = async (posts, div) => {
  for (const post of posts) {
    const ts = post.ts || (post.opened ? Number.parseInt(post.opened.substring(0, 13), 10) : 0)
    const placeholder = render.insertByTimestamp(div, post.hash, ts)
    if (!placeholder) { continue }
    setTimeout(async () => {
      const sig = await apds.get(post.hash)
      await render.blob(sig)
    }, 1)
  }
}

export const adder = (log, src, div) => {
  if (log && log[0]) {
    let index = 0

    let posts = log.slice(index, index + 25)

    addPosts(posts, div)
    index = index + 25

    window.onscroll = () => {
      if (((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 1000) && window.location.hash.substring(1) === src) {
        posts = log.slice(index, index + 25)
        index = index + 25
        addPosts(posts, div)
      }
    }
  }
}
