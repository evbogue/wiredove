import { bogbot } from 'bogbot'
import { render } from './render.js'
import { blast } from './gossip.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 
import { ntfy } from './ntfy.js' 

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

  const pubkey = await bogbot.pubkey()

  const button = h('button', {style: 'margin-left: auto; margin-right: 0px; display: block;', onclick: async () => {
    const published = await bogbot.compose(textarea.value, replyObj)
    textarea.value = ''
    const scroller = document.getElementById('scroller')
    const signed = await bogbot.get(published)
    const opened = await bogbot.open(signed)

    const blob = await bogbot.get(opened.substring(13))
    console.log(blob)
    await blast(pubkey, signed)
    await blast(pubkey, blob)
    await ntfy(signed)
    await ntfy(blob)
    const hash = await bogbot.hash(signed)
    div.id = hash
    await render.blob(signed)
    composerDiv.remove()
  }}, ['Send'])

  const textareaDiv = h('div', [
    textarea,
    button
  ])

  const composerDiv = h('div', [
    h('span', {style: 'float: right;'}, [h('code', {classList: 'pubkey'}, [pubkey.substring(0, 6)]), ' ', cancel]),
    h('span', {style: 'float: left;'}, [await avatarSpan()]),
    await nameSpan(),
    replyDiv,
    textareaDiv,
  ])

  const div = h('div', {classList: 'message'}, [
    composerDiv
  ])

  if (sig) { div.classList = 'message reply'}

  return div
  
}
