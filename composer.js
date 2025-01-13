import { bogbot } from 'bogbot'
import { render } from './render.js'
import { blast } from './gossip.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 

export const composer = async (sig) => {
  const obj = {}
  if (sig) {
    const hash = await bogbot.hash(sig)
    obj.replyHash = hash
    obj.replyAuthor = sig.substring(0, 44)
    const opened = await bogbot.open(sig)
    const msg = await bogbot.parseYaml(await bogbot.get(opened.substring(13)))
    if (msg.name) { obj.replyName = msg.name }
    if (msg.body) {obj.replyBody = msg.body}
  }

  const replyDiv = h('div')

  if (obj.replyHash) {
    const replySymbol = h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left'])
    const author = h('a', {href: '#' + obj.replyAuthor}, [obj.replyAuthor.substring(0, 10)])
    const replyContent = h('a', {href: '#' + obj.replyHash}, [obj.replyHash.substring(0, 10)])
    replyDiv.appendChild(author)
    if (obj.replyName) { author.textContent = obj.replyName}
    if (obj.replyBody) { replyContent.textContent = obj.replyBody.substring(0, 10) + '...'}
    replyDiv.appendChild(replySymbol)
    replyDiv.appendChild(replyContent)
  }

  const textarea = h('textarea', {placeholder: 'Write a message'})

  const cancel = h('a', {classList: 'material-symbols-outlined', onclick: () => {
      div.parentNode.removeChild(div)
    }
  }, ['Cancel'])

  const replyObj = {}

  if (sig) {
    replyObj.reply = await bogbot.hash(sig)
    replyObj.replyto = sig.substring(0, 44)
  }

  const button = h('button', {classList: 'material-symbols-outlined', style: 'margin-left: auto; margin-right: 0px; display: block;', onclick: async () => {
    const published = await bogbot.compose(textarea.value, replyObj)
    textarea.value = ''
    const scroller = document.getElementById('scroller')
    const signed = await bogbot.get(published)
    await blast(signed)
    const hashDiv = await render.hash(published)
    div.parentNode.appendChild(hashDiv)
    div.remove()
  }}, ['Send'])

  const pubkey = await bogbot.pubkey()

  const textareaDiv = h('div', {style: 'margin-left: 57px;'}, [
    textarea,
    button
  ])

  const div = h('div', {classList: 'message'}, [
    h('span', {style: 'float: right;'}, [h('code', {classList: 'pubkey'}, [pubkey.substring(0, 10)]), ' ', cancel]),
    h('span', {style: 'float: left;'}, [await avatarSpan()]),
    await nameSpan(),
    replyDiv,
    textareaDiv,
  ])

  return div
}
