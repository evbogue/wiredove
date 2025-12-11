import { render } from './render.js'
import { apds } from 'apds'

const addPosts = async (posts, div) => {
  for (const post of posts) {
    div.appendChild(render.hash(post.hash))
    setTimeout(async () => {
      const sig = await apds.get(post.hash)
      await render.blob(sig)
    }, 1)
  }
}

export const adder = (log, src, div) => {
  if (log && log[0]) {
    let index = 0

    const reverse = log.slice().reverse()
    let posts = reverse.slice(index, index + 25)

    addPosts(posts, div)
    index = index + 25

    window.onscroll = () => {
      if (((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 1000) && window.location.hash.substring(1) === src) {
        posts = reverse.slice(index, index + 25)
        index = index + 25
        addPosts(posts, div)
      }
    }
  }
}
